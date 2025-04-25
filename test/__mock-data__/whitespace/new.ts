function processData(data) {
  const result = data
    .map((item) => {
      return item.value
    })
    .filter((value) => value > 0)
  return result
}
