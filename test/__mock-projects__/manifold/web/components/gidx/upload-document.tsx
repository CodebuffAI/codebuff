import { useUser } from 'web/hooks/use-user'
import { useEffect, useState } from 'react'
import { Row } from 'web/components/layout/row'
import { Button, buttonClass } from 'web/components/buttons/button'
import { z } from 'zod'
import { APIError } from 'common/api/utils'
import { FileUploadButton } from 'web/components/buttons/file-upload-button'
import { Col } from 'web/components/layout/col'
import { api } from 'web/lib/api/api'
import { uploadPrivateImage } from 'web/lib/firebase/storage'
import { last } from 'lodash'
import { Select } from 'web/components/widgets/select'
import clsx from 'clsx'
import { GIDXDocument, idNameToCategoryType } from 'common/gidx/gidx'
import {
  MdOutlineCheckBox,
  MdOutlineCheckBoxOutlineBlank,
} from 'react-icons/md'

export const UploadDocuments = (props: {
  back: () => void
  next: () => void
}) => {
  const { back, next } = props
  const user = useUser()
  const [docs, setDocs] = useState<{
    documents: GIDXDocument[]
    utilityDocuments: GIDXDocument[]
    rejectedDocuments: GIDXDocument[]
    idDocuments: GIDXDocument[]
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [file, setFile] = useState<File | null>(null)
  const [CategoryType, setCategoryType] = useState(2)

  const uploadDocument = async () => {
    if (!user) return
    if (!file) {
      setError('Please select a file.')
      return
    }

    const FileTypeSchema = z.union([
      z.literal('application/pdf'),
      z.literal('image/jpeg'),
      z.literal('image/png'),
      z.literal('image/webp'),
    ])

    const validationResult = FileTypeSchema.safeParse(file.type)
    if (!validationResult.success) {
      setError('Invalid file type. Only PDF, JPEG, WEBP, and PNG are allowed.')
      return
    }
    const ext = last(file.name.split('.'))
    const fileName = `id-document-${
      getKeyFromValue(idNameToCategoryType, CategoryType) ?? ''
    }.${ext}`

    const fileUrl = await uploadPrivateImage(user.id, file, fileName)
    setLoading(true)
    setError(null)
    const { status } = await api('upload-document-gidx', {
      fileUrl,
      fileName,
      CategoryType,
    }).catch((e) => {
      console.error(e)
      if (e instanceof APIError) {
        setError(e.message)
      }
      return { status: 'error' }
    })
    if (status !== 'success') {
      setLoading(false)
      return
    }
    await getAndSetDocuments()
  }

  const getAndSetDocuments = async () => {
    setLoading(true)
    const { documents, utilityDocuments, rejectedDocuments, idDocuments } =
      await api('get-verification-documents-gidx', {})
        .catch((e) => {
          console.error(e)
          if (e instanceof APIError) {
            setError(e.message)
          }
          return {
            documents: null,
            utilityDocuments: null,
            idDocuments: null,
            rejectedDocuments: null,
          }
        })
        .finally(() => setLoading(false))
    if (!documents) return
    console.log(documents)
    setDocs({
      documents,
      rejectedDocuments,
      utilityDocuments,
      idDocuments,
    })
    setFile(null)
  }

  useEffect(() => {
    getAndSetDocuments()
  }, [])

  const hasIdDoc = (docs?.idDocuments ?? []).length > 0
  const hasUtilityDoc = (docs?.utilityDocuments ?? []).length > 0
  const hasRejectedUtilityDoc = (docs?.rejectedDocuments ?? []).some(
    (doc) => doc.CategoryType === 7 || doc.CategoryType === 1
  )
  const hasRejectedIdDoc = (docs?.rejectedDocuments ?? []).some(
    (doc) => doc.CategoryType !== 7 && doc.CategoryType !== 1
  )
  return (
    <Col className={'gap-3 p-4'}>
      <span className={'text-primary-700 text-2xl'}>Identity Verification</span>
      <Col className={'gap-2'}>
        <span className={'font-semibold'}>Please upload both:</span>
        <ul>
          <li className={'mb-2'}>
            {hasIdDoc ? (
              <span className={'text-teal-600'}>
                <MdOutlineCheckBox
                  className={'mb-0.5 mr-1 inline-block h-4 w-4'}
                />
                Identity document such as passport or driver's license
              </span>
            ) : (
              <Col>
                <span>
                  <MdOutlineCheckBoxOutlineBlank
                    className={'mb-0.5 mr-1 inline-block h-4 w-4'}
                  />
                  Identity document such as passport or driver's license
                </span>
                {hasRejectedIdDoc && (
                  <span className={'ml-5 text-red-500'}>
                    Your previous id document was rejected, please try again.
                  </span>
                )}
              </Col>
            )}
          </li>
          <li>
            {hasUtilityDoc ? (
              <span className={'text-teal-600'}>
                <MdOutlineCheckBox
                  className={'mb-0.5 mr-1 inline-block h-4 w-4'}
                />
                A utility bill or similar showing your name and address
              </span>
            ) : (
              <Col>
                <span>
                  <MdOutlineCheckBoxOutlineBlank
                    className={'mb-0.5 mr-1 inline-block h-4 w-4'}
                  />
                  A utility bill or similar showing your name and address
                </span>
                {hasRejectedUtilityDoc && (
                  <span className={'ml-5 text-red-500'}>
                    Your previous utility document was rejected, please try
                    again.
                  </span>
                )}
              </Col>
            )}
          </li>
        </ul>
      </Col>
      {error && <span className={'text-red-500'}>{error}</span>}

      {(!hasIdDoc || !hasUtilityDoc) && (
        <Col className={'gap-3'}>
          <span className={'font-semibold'}>Document type</span>
          <Select
            className={''}
            value={CategoryType}
            onChange={(e) => setCategoryType(Number(e.target.value))}
          >
            {Object.entries(idNameToCategoryType).map(([type, number]) => (
              <option key={type} value={number}>
                {type}
              </option>
            ))}
          </Select>
          {file && (
            <img
              alt={'Document'}
              src={file ? URL.createObjectURL(file) : ''}
              width={500}
              height={500}
              className="bg-ink-400 flex items-center justify-center"
            />
          )}
          {file ? <span>{file.name}</span> : null}
          <Row>
            <FileUploadButton
              accept={['.pdf', '.jpg', '.jpeg', '.png', '.webp']}
              onFiles={(files) => setFile(files[0])}
              className={clsx(
                !file
                  ? buttonClass('md', 'indigo')
                  : buttonClass('md', 'indigo-outline')
              )}
            >
              Select a {file ? 'different ' : ''}file
            </FileUploadButton>
          </Row>
        </Col>
      )}
      <Row className={'mb-4 mt-4 w-full gap-16'}>
        <Button color={'gray-white'} disabled={loading} onClick={back}>
          Back
        </Button>
        {!hasIdDoc || !hasUtilityDoc ? (
          <Button
            loading={loading}
            disabled={loading || !file}
            onClick={uploadDocument}
          >
            Submit{' '}
          </Button>
        ) : (
          <Button loading={loading} disabled={loading} onClick={next}>
            Continue
          </Button>
        )}
      </Row>
    </Col>
  )
}

const getKeyFromValue = (obj: Record<string, number>, value: number) =>
  Object.keys(obj).find((key) => obj[key] === value)
