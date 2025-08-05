export function getErrorObject(error: any) {
  return {
    message: error.message,
    stack: error.stack,
    name: error.name,
  }
}