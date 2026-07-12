const activeBashControllers = new Map<string, AbortController>()

export const registerBashCommand = (id: string): AbortController => {
  const controller = new AbortController()
  activeBashControllers.set(id, controller)
  return controller
}

export const finishBashCommand = (id: string): void => {
  activeBashControllers.delete(id)
}

export const cancelBashCommand = (id: string): boolean => {
  const controller = activeBashControllers.get(id)
  if (!controller) return false
  controller.abort()
  return true
}

export const cancelAllBashCommands = (): number => {
  const controllers = [...activeBashControllers.values()]
  for (const controller of controllers) controller.abort()
  return controllers.length
}
