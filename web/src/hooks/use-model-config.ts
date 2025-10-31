import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'

interface ModelConfig {
  model: string
}

interface OrgFeature {
  org_id: string
  feature: string
  config: ModelConfig
}

async function fetchModelConfig(orgId: string): Promise<ModelConfig> {
  const response = await fetch(`/api/admin/orgs/${orgId}/features/model_config`)
  if (!response.ok) {
    if (response.status === 404) {
      return { model: '' } // Default config if not found
    }
    throw new Error('Failed to fetch model config')
  }
  const data: OrgFeature = await response.json()
  return data.config || { model: '' }
}

async function saveModelConfig(variables: {
  orgId: string
  config: ModelConfig
}): Promise<OrgFeature> {
  const { orgId, config } = variables
  const response = await fetch(
    `/api/admin/orgs/${orgId}/features/model_config`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    },
  )

  if (!response.ok) {
    throw new Error('Failed to save configuration')
  }
  return response.json()
}

export const useModelConfigQuery = (orgId: string, enabled: boolean) => {
  return useQuery({
    queryKey: ['model-config', orgId],
    queryFn: () => fetchModelConfig(orgId),
    enabled: enabled && !!orgId,
  })
}

export const useSaveModelConfigMutation = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: saveModelConfig,
    onSuccess: (data) => {
      queryClient.setQueryData(['model-config', data.org_id], data.config)
      queryClient.invalidateQueries({ queryKey: ['model-config', data.org_id] })
    },
  })
}
