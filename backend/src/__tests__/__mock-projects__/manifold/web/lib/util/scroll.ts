export const scrollIntoViewCentered = (element: HTMLElement) => {
  // Because elem.scrollIntoView({ block: 'center' }) doesn't work on safari (mobile/desktop).
  const elementRect = element.getBoundingClientRect()
  const absoluteElementTop = elementRect.top + window.pageYOffset
  const halfWindowHeight = window.innerHeight / 2
  const middle =
    absoluteElementTop -
    halfWindowHeight +
    Math.min(elementRect.height / 2, halfWindowHeight - 58)
  window.scrollTo(0, middle)
}
