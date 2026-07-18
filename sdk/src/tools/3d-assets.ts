import { createHash, randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import path from 'node:path'

import { get3dAssetFormat } from '@codebuff/common/util/file'

import { getSystemProcessEnv } from '../env'
import { resolveFilePathForFileSystemOperation } from './path-utils'
import { readImages } from './read-image'
import { isReadPathBlocked } from './read-policy'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { FileFilter } from './read-files'

const MAX_INSPECT_BYTES = 256 * 1024 * 1024
const MAX_TEXT_ASSET_BYTES = 24 * 1024 * 1024
const BLENDER_TIMEOUT_MS = 120_000
const BLENDER_JSON_MARKER = 'OPENBUFF_3D_JSON:'

type JsonRecord = Record<string, unknown>

type AssetReceipt = {
  path: string
  sourcePath: string
  sourceHash: string
  artifactHash: string
  mediaType: string
  dimensions?: { width: number; height: number }
  producer: string
  createdAt: string
  view?: string
  mode?: string
}

function collectSceneConcepts(value: unknown): string[] {
  const concepts = new Set<string>()
  const visit = (entry: unknown, key = ''): void => {
    if (concepts.size >= 200) return
    if (typeof entry === 'string') {
      if (
        entry.length > 0 &&
        entry.length <= 160 &&
        /name|material|object|collection|camera|light|action|animation|image|mesh/i.test(
          key,
        )
      ) {
        concepts.add(entry)
      }
      return
    }
    if (Array.isArray(entry)) {
      for (const item of entry.slice(0, 1_000)) visit(item, key)
      return
    }
    if (entry && typeof entry === 'object') {
      for (const [childKey, child] of Object.entries(entry)) {
        visit(child, childKey)
      }
    }
  }
  visit(value)
  return [...concepts]
}

const BLENDER_INSPECT_SCRIPT = String.raw`
import bpy, json, os

def vec(value):
    return [round(float(v), 6) for v in value]

def bbox(obj):
    if not getattr(obj, "bound_box", None):
        return None
    points = [obj.matrix_world @ __import__('mathutils').Vector(corner) for corner in obj.bound_box]
    return {"min": vec([min(p[i] for p in points) for i in range(3)]), "max": vec([max(p[i] for p in points) for i in range(3)])}

objects = []
for obj in list(bpy.context.scene.objects)[:1000]:
    data = {
        "name": obj.name,
        "type": obj.type,
        "location": vec(obj.location),
        "rotationEuler": vec(obj.rotation_euler),
        "scale": vec(obj.scale),
        "boundingBox": bbox(obj),
        "modifiers": [modifier.type for modifier in obj.modifiers],
        "materials": [slot.material.name for slot in obj.material_slots if slot.material],
    }
    if obj.type == 'MESH' and obj.data:
        data["mesh"] = {"vertices": len(obj.data.vertices), "edges": len(obj.data.edges), "polygons": len(obj.data.polygons)}
    objects.append(data)

images = []
for image in bpy.data.images:
    if image.source == 'FILE':
        absolute_path = bpy.path.abspath(image.filepath)
        images.append({"name": image.name, "path": absolute_path, "packed": image.packed_file is not None, "missing": image.packed_file is None and not os.path.exists(absolute_path)})

scene = bpy.context.scene
result = {
    "objects": objects,
    "collections": [collection.name for collection in list(bpy.data.collections)[:1000]],
    "materials": [material.name for material in list(bpy.data.materials)[:1000]],
    "images": images,
    "missingDependencies": [image["path"] for image in images if image["missing"]],
    "cameras": [camera.name for camera in list(bpy.data.cameras)[:1000]],
    "lights": [{"name": light.name, "type": light.type, "energy": light.energy} for light in list(bpy.data.lights)[:1000]],
    "armatures": [armature.name for armature in list(bpy.data.armatures)[:1000]],
    "actions": [{"name": action.name, "frameRange": vec(action.frame_range)} for action in list(bpy.data.actions)[:1000]],
    "frameRange": [scene.frame_start, scene.frame_end],
    "render": {"engine": scene.render.engine, "resolution": [scene.render.resolution_x, scene.render.resolution_y], "fps": scene.render.fps},
    "activeCamera": scene.camera.name if scene.camera else None,
}
print("${BLENDER_JSON_MARKER}" + json.dumps(result, separators=(',', ':')))
`

const BLENDER_IMPORT_SCRIPT = String.raw`
import bpy, os

source_path = os.environ['OPENBUFF_3D_SOURCE_PATH']
source_format = os.environ['OPENBUFF_3D_SOURCE_FORMAT']
bpy.ops.wm.read_factory_settings(use_empty=True)
if source_format == 'fbx':
    if hasattr(bpy.ops.wm, 'fbx_import'):
        bpy.ops.wm.fbx_import(filepath=source_path)
    else:
        bpy.ops.import_scene.fbx(filepath=source_path)
elif source_format == 'dae':
    if hasattr(bpy.ops.wm, 'collada_import'):
        bpy.ops.wm.collada_import(filepath=source_path)
    else:
        bpy.ops.wm.collada_import(filepath=source_path)
elif source_format == 'stl':
    if hasattr(bpy.ops.wm, 'stl_import'):
        bpy.ops.wm.stl_import(filepath=source_path)
    else:
        bpy.ops.import_mesh.stl(filepath=source_path)
elif source_format == 'ply':
    if hasattr(bpy.ops.wm, 'ply_import'):
        bpy.ops.wm.ply_import(filepath=source_path)
    else:
        bpy.ops.import_mesh.ply(filepath=source_path)
elif source_format in ('usd', 'usda', 'usdc', 'usdz'):
    bpy.ops.wm.usd_import(filepath=source_path)
else:
    raise ValueError('Blender importer unavailable for .' + source_format)
`

const BLENDER_IMPORT_AND_INSPECT_SCRIPT =
  BLENDER_IMPORT_SCRIPT + BLENDER_INSPECT_SCRIPT

const BLENDER_PREVIEW_SCRIPT = String.raw`
import bpy, math, os
from mathutils import Vector

output_dir = os.environ['OPENBUFF_3D_OUTPUT_DIR']
views_csv = os.environ['OPENBUFF_3D_VIEWS']
mode = os.environ['OPENBUFF_3D_MODE']
width = os.environ['OPENBUFF_3D_WIDTH']
height = os.environ['OPENBUFF_3D_HEIGHT']
views = views_csv.split(',')
scene = bpy.context.scene
scene.render.image_settings.file_format = 'PNG'
scene.render.resolution_x = int(width)
scene.render.resolution_y = int(height)
scene.render.resolution_percentage = 100
scene.render.film_transparent = False
scene.world.color = (0.055, 0.055, 0.055)

mesh_objects = [obj for obj in scene.objects if obj.type == 'MESH']
points = [obj.matrix_world @ Vector(corner) for obj in mesh_objects for corner in obj.bound_box]
if points:
    low = Vector([min(p[i] for p in points) for i in range(3)])
    high = Vector([max(p[i] for p in points) for i in range(3)])
    center = (low + high) / 2
    radius = max((high - low).length / 2, 0.5)
else:
    center, radius = Vector((0, 0, 0)), 2.0

original_camera = scene.camera
camera_data = bpy.data.cameras.new('OpenbuffPreviewCamera')
camera = bpy.data.objects.new('OpenbuffPreviewCamera', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
camera.data.lens = 50

def point_camera(location):
    camera.location = location
    camera.rotation_euler = (center - location).to_track_quat('-Z', 'Y').to_euler()

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 16
light_data = bpy.data.lights.new('OpenbuffPreviewKey', type='AREA')
light_data.energy = 1200
light_data.shape = 'DISK'
light_data.size = max(radius, 1.0)
light = bpy.data.objects.new('OpenbuffPreviewKey', light_data)
scene.collection.objects.link(light)
light.location = center + Vector((radius, -radius, radius * 2))
light.rotation_euler = (center - light.location).to_track_quat('-Z', 'Y').to_euler()
if mode == 'clay':
    clay_material = bpy.data.materials.new('OpenbuffClay')
    clay_material.diffuse_color = (0.62, 0.66, 0.70, 1.0)
    for obj in mesh_objects:
        obj.data.materials.clear()
        obj.data.materials.append(clay_material)
elif mode == 'wireframe':
    for obj in mesh_objects:
        wire = obj.modifiers.new('OpenbuffWireframe', 'WIREFRAME')
        wire.thickness = max(radius * 0.005, 0.001)

directions = {
    'perspective': Vector((1.5, -1.5, 1.15)),
    'front': Vector((0, -1, 0)),
    'side': Vector((1, 0, 0)),
    'top': Vector((0, 0, 1)),
    'camera': None,
}
distance = radius * 3.2
for view in views:
    if view == 'camera' and original_camera:
        scene.camera = original_camera
    else:
        scene.camera = camera
        direction = directions.get(view) or directions['perspective']
        point_camera(center + direction.normalized() * distance)
    scene.render.filepath = output_dir + '/' + view + '-' + mode + '.png'
    bpy.ops.render.render(write_still=True)
`

const BLENDER_EDIT_SCRIPT = String.raw`
import bpy, json, math, os

operations = json.loads(os.environ['OPENBUFF_3D_OPERATIONS'])
changed = []
for operation in operations:
    kind = operation['type']
    if kind == 'rename_object':
        obj = bpy.data.objects.get(operation['object'])
        if obj is None:
            raise ValueError('Object not found: ' + operation['object'])
        old = obj.name
        obj.name = operation['new_name']
        changed.append({'type': kind, 'before': old, 'after': obj.name})
    elif kind == 'set_object_transform':
        obj = bpy.data.objects.get(operation['object'])
        if obj is None:
            raise ValueError('Object not found: ' + operation['object'])
        if 'location' in operation:
            obj.location = operation['location']
        if 'rotation_degrees' in operation:
            obj.rotation_euler = [math.radians(value) for value in operation['rotation_degrees']]
        if 'scale' in operation:
            obj.scale = operation['scale']
        changed.append({'type': kind, 'object': obj.name})
    elif kind == 'set_render_resolution':
        scene = bpy.context.scene
        scene.render.resolution_x = operation['width']
        scene.render.resolution_y = operation['height']
        scene.render.resolution_percentage = operation.get('percentage', 100)
        changed.append({'type': kind})
    elif kind == 'set_frame_range':
        scene = bpy.context.scene
        scene.frame_start = operation['start']
        scene.frame_end = operation['end']
        changed.append({'type': kind})
    else:
        raise ValueError('Unsupported operation: ' + str(kind))

bpy.ops.wm.save_as_mainfile(filepath=bpy.data.filepath, check_existing=False)
print("${BLENDER_JSON_MARKER}" + json.dumps({'changed': changed}, separators=(',', ':')))
`

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

function jsonOutput<T extends 'inspect_3d_asset' | 'render_3d_preview'>(
  value: JsonRecord,
): CodebuffToolOutput<T> {
  return [{ type: 'json', value }] as CodebuffToolOutput<T>
}

async function runBlender(
  args: string[],
  timeout = BLENDER_TIMEOUT_MS,
  environment: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<{ ok: true; stdout: string } | { ok: false; error: string }> {
  if (signal?.aborted) {
    return { ok: false, error: 'Blender operation cancelled.' }
  }
  return new Promise((resolve) => {
    const child = spawn('blender', ['--disable-autoexec', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: { ...getSystemProcessEnv(), ...environment },
    })
    const maxOutputBytes = 8 * 1024 * 1024
    let output = ''
    let outputBytes = 0
    let forcedError: string | undefined
    let settled = false

    const finish = (
      result: { ok: true; stdout: string } | { ok: false; error: string },
    ) => {
      if (settled) return
      settled = true
      clearTimeout(timeoutId)
      signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }
    const stop = (message: string) => {
      if (forcedError) return
      forcedError = message
      try {
        child.kill('SIGKILL')
      } catch {
        finish({ ok: false, error: message })
      }
    }
    const appendOutput = (chunk: Buffer) => {
      if (forcedError) return
      outputBytes += chunk.byteLength
      if (outputBytes > maxOutputBytes) {
        stop('Blender output exceeded the 8MB safety limit.')
        return
      }
      output += chunk.toString('utf8')
    }
    child.stdout.on('data', appendOutput)
    child.stderr.on('data', appendOutput)
    child.on('error', (error) => finish({ ok: false, error: error.message }))
    child.on('close', (code) => {
      if (forcedError) {
        finish({ ok: false, error: forcedError })
        return
      }
      if (code !== 0) {
        const detail = output.trim().slice(-4_000)
        finish({
          ok: false,
          error: `Blender exited with status ${code}${detail ? `: ${detail}` : ''}`,
        })
        return
      }
      if (
        output.includes('Traceback (most recent call last)') ||
        output.includes('Error: Python:')
      ) {
        finish({
          ok: false,
          error: `Blender Python execution failed: ${output.trim().slice(-4_000)}`,
        })
        return
      }
      finish({ ok: true, stdout: output })
    })
    const timeoutId = setTimeout(
      () => stop(`Blender operation timed out after ${timeout}ms.`),
      timeout,
    )
    const onAbort = () => stop('Blender operation cancelled.')
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function summarizeGltf(document: JsonRecord): JsonRecord {
  const array = (key: string) =>
    Array.isArray(document[key]) ? (document[key] as JsonRecord[]) : []
  const named = (key: string) =>
    array(key)
      .slice(0, 1_000)
      .map((entry, index) => String(entry.name ?? `${key}-${index}`))
  return {
    asset: document.asset ?? null,
    sceneCount: array('scenes').length,
    activeScene: document.scene ?? null,
    nodes: array('nodes')
      .slice(0, 1_000)
      .map((node, index) => ({
        name: String(node.name ?? `node-${index}`),
        mesh: node.mesh ?? null,
        camera: node.camera ?? null,
        children: node.children ?? [],
        translation: node.translation ?? [0, 0, 0],
        rotation: node.rotation ?? [0, 0, 0, 1],
        scale: node.scale ?? [1, 1, 1],
      })),
    meshes: array('meshes')
      .slice(0, 1_000)
      .map((mesh, index) => ({
        name: String(mesh.name ?? `mesh-${index}`),
        primitiveCount: Array.isArray(mesh.primitives)
          ? mesh.primitives.length
          : 0,
      })),
    materials: named('materials'),
    textures: named('textures'),
    images: array('images')
      .slice(0, 1_000)
      .map((image, index) => ({
        name: String(image.name ?? `image-${index}`),
        uri: image.uri ?? null,
        mimeType: image.mimeType ?? null,
      })),
    cameras: named('cameras'),
    animations: named('animations'),
    skins: named('skins'),
  }
}

function collectGltfUris(document: JsonRecord): string[] {
  const uris = new Set<string>()
  for (const key of ['buffers', 'images']) {
    const entries = Array.isArray(document[key])
      ? (document[key] as JsonRecord[])
      : []
    for (const entry of entries) {
      if (
        typeof entry.uri === 'string' &&
        !entry.uri.startsWith('data:') &&
        !entry.uri.includes('://')
      ) {
        uris.add(entry.uri)
      }
    }
  }
  return [...uris]
}

async function findMissingGltfDependencies(params: {
  document: JsonRecord
  sourcePath: string
  cwd: string
  fs: CodebuffFileSystem
  fileFilter?: FileFilter
}): Promise<{ dependencies: string[]; missingDependencies: string[] }> {
  const dependencies = collectGltfUris(params.document)
  const missingDependencies: string[] = []
  const sourceDirectory = path.posix.dirname(params.sourcePath)
  for (const uri of dependencies) {
    let decoded: string
    try {
      decoded = decodeURIComponent(uri)
    } catch {
      missingDependencies.push(uri)
      continue
    }
    const candidate = path.posix.normalize(
      path.posix.join(sourceDirectory, decoded),
    )
    if (isReadPathBlocked(candidate, params.fileFilter)) {
      missingDependencies.push(uri)
      continue
    }
    const resolved = await resolveFilePathForFileSystemOperation(
      params.cwd,
      candidate,
      params.fs,
    )
    if (!resolved) {
      missingDependencies.push(uri)
      continue
    }
    try {
      const stats = await params.fs.stat(resolved.operationPath)
      if (!stats.isFile()) missingDependencies.push(uri)
    } catch {
      missingDependencies.push(uri)
    }
  }
  return { dependencies, missingDependencies }
}

function parseGlb(buffer: Buffer): JsonRecord {
  if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF') {
    throw new Error('Invalid GLB header.')
  }
  const version = buffer.readUInt32LE(4)
  const declaredLength = buffer.readUInt32LE(8)
  if (version !== 2 || declaredLength > buffer.length) {
    throw new Error(`Unsupported or truncated GLB (version ${version}).`)
  }
  const chunkLength = buffer.readUInt32LE(12)
  const chunkType = buffer.readUInt32LE(16)
  if (chunkType !== 0x4e4f534a || 20 + chunkLength > buffer.length) {
    throw new Error('GLB does not begin with a valid JSON chunk.')
  }
  return JSON.parse(buffer.toString('utf8', 20, 20 + chunkLength).trim())
}

function summarizeObj(content: string): JsonRecord {
  const counts = { vertices: 0, textureCoordinates: 0, normals: 0, faces: 0 }
  const objects = new Set<string>()
  const groups = new Set<string>()
  const materials = new Set<string>()
  const materialLibraries = new Set<string>()
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line.startsWith('v ')) counts.vertices++
    else if (line.startsWith('vt ')) counts.textureCoordinates++
    else if (line.startsWith('vn ')) counts.normals++
    else if (line.startsWith('f ')) counts.faces++
    else if (line.startsWith('o ')) objects.add(line.slice(2).trim())
    else if (line.startsWith('g ')) groups.add(line.slice(2).trim())
    else if (line.startsWith('usemtl ')) materials.add(line.slice(7).trim())
    else if (line.startsWith('mtllib '))
      materialLibraries.add(line.slice(7).trim())
  }
  return {
    ...counts,
    objects: [...objects].slice(0, 500),
    groups: [...groups].slice(0, 500),
    materials: [...materials].slice(0, 500),
    materialLibraries: [...materialLibraries].slice(0, 100),
  }
}

async function readContainedAsset(params: {
  assetPath: string
  cwd: string
  fs: CodebuffFileSystem
  fileFilter?: FileFilter
}) {
  const resolved = await resolveFilePathForFileSystemOperation(
    params.cwd,
    params.assetPath,
    params.fs,
  )
  if (!resolved) throw new Error('Asset path is outside the project root.')
  if (isReadPathBlocked(resolved.relativePath, params.fileFilter)) {
    throw new Error(
      'Asset path is blocked by the authorized filesystem policy.',
    )
  }
  const format = get3dAssetFormat(resolved.relativePath)
  if (!format) throw new Error('Unsupported 3D asset format.')
  const stats = await params.fs.stat(resolved.operationPath)
  if (!stats.isFile()) throw new Error('Asset path is not a file.')
  if (stats.size > MAX_INSPECT_BYTES) {
    throw new Error(
      `Asset exceeds the ${MAX_INSPECT_BYTES} byte inspection limit.`,
    )
  }
  const data = Buffer.from(await params.fs.readFile(resolved.operationPath))
  return { resolved, format, stats, data, sourceHash: sha256(data) }
}

export async function inspect3dAsset(params: {
  path: string
  cwd: string
  fs: CodebuffFileSystem
  signal?: AbortSignal
  fileFilter?: FileFilter
}): Promise<CodebuffToolOutput<'inspect_3d_asset'>> {
  try {
    if (params.signal?.aborted) throw new Error('3D inspection cancelled.')
    const asset = await readContainedAsset({
      assetPath: params.path,
      cwd: params.cwd,
      fs: params.fs,
      fileFilter: params.fileFilter,
    })
    let summary: JsonRecord
    if (asset.format === 'gltf') {
      if (asset.data.length > MAX_TEXT_ASSET_BYTES) {
        throw new Error('glTF JSON exceeds the structured parser size limit.')
      }
      const document = JSON.parse(asset.data.toString('utf8')) as JsonRecord
      summary = {
        ...summarizeGltf(document),
        ...(await findMissingGltfDependencies({
          document,
          sourcePath: asset.resolved.relativePath,
          cwd: params.cwd,
          fs: params.fs,
          fileFilter: params.fileFilter,
        })),
      }
    } else if (asset.format === 'glb') {
      const document = parseGlb(asset.data)
      summary = {
        ...summarizeGltf(document),
        ...(await findMissingGltfDependencies({
          document,
          sourcePath: asset.resolved.relativePath,
          cwd: params.cwd,
          fs: params.fs,
          fileFilter: params.fileFilter,
        })),
      }
    } else if (asset.format === 'obj') {
      if (asset.data.length > MAX_TEXT_ASSET_BYTES) {
        throw new Error('OBJ exceeds the structured parser size limit.')
      }
      summary = summarizeObj(asset.data.toString('utf8'))
    } else if (asset.format === 'blend') {
      const blender = await runBlender(
        [
          '--background',
          asset.resolved.operationPath,
          '--python-expr',
          BLENDER_INSPECT_SCRIPT,
        ],
        BLENDER_TIMEOUT_MS,
        {},
        params.signal,
      )
      if (!blender.ok) throw new Error(blender.error)
      const markerIndex = blender.stdout.lastIndexOf(BLENDER_JSON_MARKER)
      if (markerIndex < 0)
        throw new Error('Blender did not return a scene summary.')
      const line = blender.stdout
        .slice(markerIndex + BLENDER_JSON_MARKER.length)
        .split(/\r?\n/, 1)[0]
      summary = JSON.parse(line)
    } else {
      const blender = await runBlender(
        ['--background', '--python-expr', BLENDER_IMPORT_AND_INSPECT_SCRIPT],
        BLENDER_TIMEOUT_MS,
        {
          OPENBUFF_3D_SOURCE_PATH: asset.resolved.operationPath,
          OPENBUFF_3D_SOURCE_FORMAT: asset.format,
        },
        params.signal,
      )
      if (!blender.ok) throw new Error(blender.error)
      const markerIndex = blender.stdout.lastIndexOf(BLENDER_JSON_MARKER)
      if (markerIndex < 0)
        throw new Error('Blender did not return a scene summary.')
      summary = JSON.parse(
        blender.stdout
          .slice(markerIndex + BLENDER_JSON_MARKER.length)
          .split(/\r?\n/, 1)[0],
      )
    }
    const derivedMetadata = {
      version: 1,
      sourcePath: asset.resolved.relativePath,
      sourceHash: asset.sourceHash,
      format: asset.format,
      concepts: collectSceneConcepts(summary),
      summary,
    }
    const relativeMetadataPath = path.posix.join(
      '.openbuff',
      'artifacts',
      '3d',
      'metadata',
      `${asset.sourceHash}.json`,
    )
    let derivedMetadataPath: string | undefined
    try {
      const absoluteMetadataPath = path.join(
        params.cwd,
        ...relativeMetadataPath.split('/'),
      )
      await params.fs.mkdir(path.dirname(absoluteMetadataPath), {
        recursive: true,
      })
      const metadataContent = `${JSON.stringify(derivedMetadata)}\n`
      if (params.fs.createFileExclusive) {
        try {
          await params.fs.createFileExclusive(
            absoluteMetadataPath,
            metadataContent,
          )
        } catch (error) {
          if (
            !error ||
            typeof error !== 'object' ||
            !('code' in error) ||
            error.code !== 'EEXIST'
          ) {
            throw error
          }
        }
      } else {
        await params.fs.writeFile(absoluteMetadataPath, metadataContent)
      }
      derivedMetadataPath = relativeMetadataPath
    } catch {
      // Inspection remains useful even when an adapter cannot persist caches.
    }
    return jsonOutput<'inspect_3d_asset'>({
      path: asset.resolved.relativePath,
      format: asset.format,
      sizeBytes: asset.stats.size,
      sourceHash: asset.sourceHash,
      ...(derivedMetadataPath ? { derivedMetadataPath } : {}),
      summary,
    })
  } catch (error) {
    return jsonOutput<'inspect_3d_asset'>({
      path: params.path,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function render3dPreview(params: {
  path: string
  views: Array<'camera' | 'perspective' | 'front' | 'side' | 'top'>
  mode: 'material' | 'clay' | 'wireframe'
  width: number
  height: number
  cwd: string
  fs: CodebuffFileSystem
  signal?: AbortSignal
  fileFilter?: FileFilter
}): Promise<CodebuffToolOutput<'render_3d_preview'>> {
  try {
    if (params.signal?.aborted) throw new Error('Blender operation cancelled.')
    const asset = await readContainedAsset({
      assetPath: params.path,
      cwd: params.cwd,
      fs: params.fs,
      fileFilter: params.fileFilter,
    })
    const runId = `${asset.sourceHash.slice(0, 12)}-${randomUUID().slice(0, 8)}`
    const relativeOutputDir = path.posix.join(
      '.openbuff',
      'artifacts',
      '3d',
      runId,
    )
    const outputDir = path.join(params.cwd, ...relativeOutputDir.split('/'))
    await params.fs.mkdir(outputDir, { recursive: true })
    const previewScriptPath = path.join(outputDir, 'render-preview.py')
    await params.fs.writeFile(
      previewScriptPath,
      asset.format === 'blend'
        ? BLENDER_PREVIEW_SCRIPT
        : BLENDER_IMPORT_SCRIPT + BLENDER_PREVIEW_SCRIPT,
      { flag: 'wx' },
    )
    const blender = await runBlender(
      asset.format === 'blend'
        ? [
            '--background',
            asset.resolved.operationPath,
            '--python',
            previewScriptPath,
          ]
        : ['--background', '--python', previewScriptPath],
      Math.max(BLENDER_TIMEOUT_MS, params.views.length * 90_000),
      {
        OPENBUFF_3D_OUTPUT_DIR: outputDir,
        OPENBUFF_3D_VIEWS: params.views.join(','),
        OPENBUFF_3D_MODE: params.mode,
        OPENBUFF_3D_WIDTH: String(params.width),
        OPENBUFF_3D_HEIGHT: String(params.height),
        OPENBUFF_3D_SOURCE_PATH: asset.resolved.operationPath,
        OPENBUFF_3D_SOURCE_FORMAT: asset.format,
      },
      params.signal,
    )
    if (!blender.ok) throw new Error(blender.error)

    const createdAt = new Date().toISOString()
    const receipts: AssetReceipt[] = []
    const imagePaths: string[] = []
    for (const view of params.views) {
      const relativePath = path.posix.join(
        relativeOutputDir,
        `${view}-${params.mode}.png`,
      )
      const absolutePath = path.join(params.cwd, ...relativePath.split('/'))
      let image: Buffer
      try {
        image = Buffer.from(await params.fs.readFile(absolutePath))
      } catch {
        throw new Error(
          `Blender completed without producing ${relativePath}. Output: ${blender.stdout.slice(-2_000)}`,
        )
      }
      imagePaths.push(relativePath)
      receipts.push({
        path: relativePath,
        sourcePath: asset.resolved.relativePath,
        sourceHash: asset.sourceHash,
        artifactHash: sha256(image),
        mediaType: 'image/png',
        dimensions: { width: params.width, height: params.height },
        producer: 'blender',
        createdAt,
        view,
        mode: params.mode,
      })
    }
    const media = await readImages({
      paths: imagePaths,
      cwd: params.cwd,
      fs: params.fs,
      fileFilter: params.fileFilter,
    })
    return [
      {
        type: 'json',
        value: { sourcePath: asset.resolved.relativePath, receipts },
      },
      ...media.filter((part) => part.type === 'media'),
    ]
  } catch (error) {
    return jsonOutput<'render_3d_preview'>({
      path: params.path,
      error: error instanceof Error ? error.message : String(error),
    })
  }
}

export async function edit3dAsset(params: {
  path: string
  sourceHash: string
  operations: JsonRecord[]
  cwd: string
  fs: CodebuffFileSystem
  operationId?: string
  signal?: AbortSignal
  fileFilter?: FileFilter
}): Promise<CodebuffToolOutput<'edit_3d_asset'>> {
  const operationId =
    params.operationId && /^[a-zA-Z0-9._-]{1,128}$/.test(params.operationId)
      ? params.operationId
      : randomUUID()
  const actionId = `${operationId}:0`
  const notApplied = (message: string, beforeHash: string | null = null) =>
    [
      {
        type: 'json' as const,
        value: {
          kind: 'file_mutation_result' as const,
          version: 1 as const,
          operationId,
          outcome: 'not_applied' as const,
          actions: [
            {
              actionId,
              index: 0,
              action: 'update' as const,
              path: params.path,
              outcome: 'not_applied' as const,
              beforeHash,
              afterHash: null,
              error: {
                code: 'application_rejected' as const,
                message,
                retryable: false,
              },
            },
          ],
          authorityTier: null,
          errors: [
            {
              code: 'application_rejected' as const,
              message,
              retryable: false,
            },
          ],
          freshCapabilities: [],
        },
      },
    ] as CodebuffToolOutput<'edit_3d_asset'>

  try {
    if (params.signal?.aborted) {
      return notApplied('Blender operation cancelled.')
    }
    if (!params.fs.conditionalCommit) {
      return notApplied(
        'Guarded 3D edits require a filesystem adapter with conditionalCommit authority.',
      )
    }
    const asset = await readContainedAsset({
      assetPath: params.path,
      cwd: params.cwd,
      fs: params.fs,
      fileFilter: params.fileFilter,
    })
    if (asset.format !== 'blend') {
      return notApplied('Declarative 3D edits currently require a .blend file.')
    }
    const requestedHash = params.sourceHash.replace(/^sha256:/, '')
    if (requestedHash !== asset.sourceHash) {
      return notApplied(
        'The source hash is stale. Inspect the asset again before editing.',
        `sha256:${asset.sourceHash}`,
      )
    }

    const relativeArtifactDir = path.posix.join(
      '.openbuff',
      'artifacts',
      '3d',
      'mutations',
      operationId,
    )
    const artifactDir = path.join(params.cwd, ...relativeArtifactDir.split('/'))
    const workingPath = path.join(artifactDir, 'working.blend')
    const editScriptPath = path.join(artifactDir, 'edit-asset.py')
    await params.fs.mkdir(artifactDir, { recursive: true })
    await params.fs.writeFile(workingPath, asset.data, { flag: 'wx' })
    await params.fs.writeFile(editScriptPath, BLENDER_EDIT_SCRIPT, {
      flag: 'wx',
    })

    const blender = await runBlender(
      ['--background', workingPath, '--python', editScriptPath],
      BLENDER_TIMEOUT_MS,
      {
        OPENBUFF_3D_OPERATIONS: JSON.stringify(params.operations),
      },
      params.signal,
    )
    if (!blender.ok)
      return notApplied(blender.error, `sha256:${asset.sourceHash}`)
    const markerIndex = blender.stdout.lastIndexOf(BLENDER_JSON_MARKER)
    if (markerIndex < 0) {
      return notApplied(
        'Blender saved no structured mutation receipt.',
        `sha256:${asset.sourceHash}`,
      )
    }
    const mutationReceipt = JSON.parse(
      blender.stdout
        .slice(markerIndex + BLENDER_JSON_MARKER.length)
        .split(/\r?\n/, 1)[0],
    ) as JsonRecord
    const changedOperations = Array.isArray(mutationReceipt.changed)
      ? mutationReceipt.changed
      : []
    const validation = await runBlender(
      ['--background', workingPath, '--python-expr', BLENDER_INSPECT_SCRIPT],
      BLENDER_TIMEOUT_MS,
      {},
      params.signal,
    )
    if (!validation.ok || !validation.stdout.includes(BLENDER_JSON_MARKER)) {
      return notApplied(
        validation.ok
          ? 'The edited Blender file failed structured validation.'
          : validation.error,
        `sha256:${asset.sourceHash}`,
      )
    }
    if (params.signal?.aborted) {
      return notApplied(
        'Blender operation cancelled before commit.',
        `sha256:${asset.sourceHash}`,
      )
    }
    const editedData = Buffer.from(await params.fs.readFile(workingPath))
    const editedHash = sha256(editedData)
    const committed = await params.fs.conditionalCommit(
      asset.resolved.operationPath,
      editedData,
      { expectedHash: `sha256:${asset.sourceHash}` },
    )
    if (!committed.applied) {
      return notApplied(
        'The source changed before the guarded commit. No source file was overwritten.',
        committed.actualHash,
      )
    }

    const preview = await render3dPreview({
      path: asset.resolved.relativePath,
      views: ['perspective'],
      mode: 'clay',
      width: 512,
      height: 512,
      cwd: params.cwd,
      fs: params.fs,
      signal: params.signal,
      fileFilter: params.fileFilter,
    })
    const previewReceipt = preview.find((part) => part.type === 'json')

    return [
      {
        type: 'json',
        value: {
          kind: 'file_mutation_result',
          version: 1,
          operationId,
          outcome: 'applied',
          actions: [
            {
              actionId,
              index: 0,
              action: 'update',
              path: asset.resolved.relativePath,
              outcome: 'applied',
              beforeHash: `sha256:${asset.sourceHash}`,
              afterHash: `sha256:${editedHash}`,
            },
          ],
          authorityTier: 'conditional_commit',
          errors: [],
          freshCapabilities: [],
        },
      },
      {
        type: 'json',
        value: {
          assetMutation: {
            sourcePath: asset.resolved.relativePath,
            sourceHash: asset.sourceHash,
            resultHash: editedHash,
            artifactPath: path.posix.join(relativeArtifactDir, 'working.blend'),
            producer: 'blender',
            createdAt: new Date().toISOString(),
            operations: changedOperations,
            validation: 'reopened_and_inspected',
            preview:
              previewReceipt?.type === 'json' ? previewReceipt.value : null,
          },
        },
      },
      ...preview.filter((part) => part.type === 'media'),
    ]
  } catch (error) {
    return notApplied(error instanceof Error ? error.message : String(error))
  }
}
