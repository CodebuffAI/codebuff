export type ApiError = {
  error: string
}

type ValidationErrorDetail = {
  field: string | null
  error: string
}
export class ValidationError {
  details: ValidationErrorDetail[]

  constructor(details: ValidationErrorDetail[]) {
    this.details = details
  }
}
