'use client'

import { Upload, X, User } from 'lucide-react'
import { useState, useCallback, useRef, useEffect } from 'react'

import { Button } from './button'

import { cn } from '@/lib/utils'

interface AvatarUploadProps {
  value?: string
  onChange: (file: File | null, url: string) => void
  disabled?: boolean
  className?: string
}

export function AvatarUpload({
  value,
  onChange,
  disabled,
  className,
}: AvatarUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(value || null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Update preview URL when value prop changes
  useEffect(() => {
    setPreviewUrl(value || null)
  }, [value])

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/')) {
        return
      }

      // Convert file to data URL
      const reader = new FileReader()
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string
        setPreviewUrl(dataUrl)
        onChange(null, dataUrl) // Pass null for file since we're using data URL
      }
      reader.readAsDataURL(file)
    },
    [onChange],
  )

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragOver(false)

      if (disabled) return

      const files = Array.from(e.dataTransfer.files)
      const imageFile = files.find((file) => file.type.startsWith('image/'))

      if (imageFile) {
        handleFile(imageFile)
      }
    },
    [handleFile, disabled],
  )

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      if (!disabled) {
        setIsDragOver(true)
      }
    },
    [disabled],
  )

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
  }, [])

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        handleFile(file)
      }
    },
    [handleFile],
  )

  const handleRemove = useCallback(() => {
    if (previewUrl && previewUrl.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl)
    }
    setPreviewUrl(null)
    onChange(null, '')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [previewUrl, onChange])

  const handleClick = useCallback(() => {
    if (!disabled) {
      fileInputRef.current?.click()
    }
  }, [disabled])

  return (
    <div className={cn('space-y-4', className)}>
      <div
        className={cn(
          'relative w-32 h-32 mx-auto rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center cursor-pointer transition-colors',
          isDragOver && 'border-blue-500 bg-blue-50',
          disabled && 'cursor-not-allowed opacity-50',
          !disabled && 'hover:border-gray-400',
        )}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        {previewUrl ? (
          <>
            <img
              src={previewUrl}
              alt="Avatar preview"
              className="w-full h-full rounded-full object-cover"
            />
            {!disabled && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                className="absolute -top-2 -right-2 w-6 h-6 rounded-full p-0"
                onClick={(e) => {
                  e.stopPropagation()
                  handleRemove()
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            )}
          </>
        ) : (
          <div className="text-center">
            {isDragOver ? (
              <Upload className="w-8 h-8 text-blue-500 mx-auto mb-2" />
            ) : (
              <User className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            )}
            <p className="text-xs text-gray-500">
              {isDragOver ? 'Drop image here' : 'Click or drag image'}
            </p>
          </div>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileSelect}
        className="hidden"
        disabled={disabled}
      />

      <p className="text-xs text-center text-muted-foreground">
        Drag and drop an image, or click to browse
      </p>
    </div>
  )
}
