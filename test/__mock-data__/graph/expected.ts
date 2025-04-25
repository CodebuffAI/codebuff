// Check if we're in a browser environment
const isBrowser =
  typeof window !== 'undefined' && typeof window.document !== 'undefined'

// Use window.d3 in browser, or require('d3') in Node.js
const d3 = isBrowser ? window.d3 : require('d3')

// Global color definitions
const highlightColor = '#9370DB'
const defaultColor = '#A9A9A9'
const nodeColor = '#6495ED'

let links = null
let nodes = null
let simulation = null
let selectedNode = null
let canvas = null
let ctx = null
let transform = d3.zoomIdentity

let worker = new Worker('dataworker.js')

worker.onmessage = function (event) {
  if (event.data.type === 'graphData') {
    createD3Graph(event.data.graph, window.innerWidth, window.innerHeight)
  } else if (event.data.type === 'error') {
    console.error(event.data.message)
  }
}

function loadGraphData(url) {
  worker.postMessage({ type: 'loadData', url: url })
}

function createD3Graph(graph, parentWidth, parentHeight) {
  canvas = d3
    .select('#graph')
    .attr('width', parentWidth)
    .attr('height', parentHeight)
    .node()

  ctx = canvas.getContext('2d')

  // Calculate node sizes based on connections
  const nodeSize = d3
    .scaleLinear()
    .domain([0, d3.max(graph.nodes, (d) => d.connections)])
    .range([5, 20])

  // Create nodes and links
  nodes = graph.nodes.map((d) => ({ ...d, r: nodeSize(d.connections) }))
  links = graph.links.map((d) => ({ ...d }))

  // Create simulation
  simulation = d3
    .forceSimulation(nodes)
    .force(
      'link',
      d3
        .forceLink(links)
        .id((d) => d.id)
        .distance(100)
    )
    .force('charge', d3.forceManyBody().strength(-300))
    .force('center', d3.forceCenter(parentWidth / 2, parentHeight / 2))
    .force(
      'collision',
      d3.forceCollide().radius((d) => d.r + 10)
    )
    .on('tick', ticked)

  // Set up zoom behavior
  const zoom = d3.zoom().scaleExtent([0.1, 4]).on('zoom', zoomed)

  d3.select(canvas).call(zoom).on('dblclick.zoom', null)

  // Add search functionality
  d3.select('#search').on('input', function () {
    const searchTerm = this.value.toLowerCase()
    if (searchTerm) {
      highlightNodes(searchTerm)
    } else {
      resetGraph()
    }
  })

  // Add click event to reset graph when clicking on empty space
  d3.select(canvas).on('click', function (event) {
    const [x, y] = d3.pointer(event)
    const node = findNodeAtPosition(x, y)
    if (!node) {
      d3.select('#search').property('value', '')
      resetGraph()
      selectedNode = null
    } else {
      setSelectedNode(node)
    }
  })

  // Add mousemove event for hover effect
  d3.select(canvas).on('mousemove', function (event) {
    const [x, y] = d3.pointer(event)
    const node = findNodeAtPosition(x, y)
    this.style.cursor = node ? 'pointer' : 'default'
  })
}

function ticked() {
  ctx.save()
  ctx.clearRect(0, 0, canvas.width, canvas.height)
  ctx.translate(transform.x, transform.y)
  ctx.scale(transform.k, transform.k)

  // Draw links
  ctx.strokeStyle = defaultColor
  ctx.lineWidth = 0.5
  links.forEach(drawLink)

  // Draw nodes
  nodes.forEach(drawNode)

  // Draw labels
  ctx.font = '12px Arial'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  nodes.forEach(drawLabel)

  ctx.restore()
}

function drawLink(d) {
  ctx.beginPath()
  ctx.moveTo(d.source.x, d.source.y)
  ctx.lineTo(d.target.x, d.target.y)
  ctx.stroke()
}

function drawNode(d) {
  ctx.beginPath()
  ctx.moveTo(d.x + d.r, d.y)
  ctx.arc(d.x, d.y, d.r, 0, 2 * Math.PI)
  ctx.fillStyle = d === selectedNode ? highlightColor : nodeColor
  ctx.fill()
}

function drawLabel(d) {
  ctx.fillStyle = 'black'
  ctx.fillText(d.name, d.x + d.r + 2, d.y)
}

function zoomed(event) {
  transform = event.transform
  ticked()
}

function highlightNodes(searchTerm) {
  const matchedNodes = nodes.filter((n) =>
    n.name.toLowerCase().includes(searchTerm)
  )

  if (matchedNodes.length === 0) {
    resetGraph()
    return
  }

  const connectedNodes = new Set(matchedNodes.map((n) => n.id))
  const connectedLinks = new Set()

  links.forEach((d) => {
    if (
      matchedNodes.some((n) => n.id === d.source.id || n.id === d.target.id)
    ) {
      connectedNodes.add(d.source.id)
      connectedNodes.add(d.target.id)
      connectedLinks.add(d)
    }
  })

  nodes.forEach((d) => {
    d.highlighted =
      matchedNodes.some((n) => n.id === d.id) || connectedNodes.has(d.id)
    d.opacity = d.highlighted ? 1 : 0.1
  })

  links.forEach((d) => {
    d.highlighted = connectedLinks.has(d)
    d.opacity = d.highlighted ? 1 : 0.1
  })

  // Zoom to the first matched node
  if (matchedNodes.length > 0) {
    zoomToNode(matchedNodes[0])
  }

  ticked()
}

function setSelectedNode(node) {
  if (selectedNode === node) return

  const connectedNodes = new Set([node.id])
  const connectedLinks = new Set()

  links.forEach((d) => {
    if (d.source.id === node.id || d.target.id === node.id) {
      connectedNodes.add(d.source.id)
      connectedNodes.add(d.target.id)
      connectedLinks.add(d)
    }
  })

  nodes.forEach((d) => {
    d.highlighted = d.id === node.id || connectedNodes.has(d.id)
    d.opacity = d.highlighted ? 1 : 0.1
  })

  links.forEach((d) => {
    d.highlighted = connectedLinks.has(d)
    d.opacity = d.highlighted ? 1 : 0.1
  })

  selectedNode = node
  console.log('Selected node:', node.name)

  // Zoom to the selected node
  zoomToNode(node)

  ticked()
}

function resetGraph() {
  nodes.forEach((d) => {
    d.highlighted = false
    d.opacity = 1
  })

  links.forEach((d) => {
    d.highlighted = false
    d.opacity = 1
  })

  selectedNode = null
  ticked()
}

function zoomToNode(node) {
  const scale = 1
  const x = -node.x * scale + canvas.width / 2
  const y = -node.y * scale + canvas.height / 2

  transform = d3.zoomIdentity.translate(x, y).scale(scale)
  d3.select(canvas)
    .transition()
    .duration(500)
    .call(d3.zoom().transform, transform)
}

function findNodeAtPosition(x, y) {
  const invertedPoint = transform.invert([x, y])
  return nodes.find((node) => {
    const dx = invertedPoint[0] - node.x
    const dy = invertedPoint[1] - node.y
    return dx * dx + dy * dy < node.r * node.r
  })
}

// Usage
if (isBrowser) {
  document.addEventListener('DOMContentLoaded', function () {
    loadGraphData('merged20240726.csv')
  })
} else {
  console.warn('This script is intended to run in a browser environment.')
}
