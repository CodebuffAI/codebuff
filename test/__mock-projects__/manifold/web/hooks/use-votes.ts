import { User } from 'common/user'
import { useEffect, useState } from 'react'
import { getContractVoters, getOptionVoters } from 'web/lib/supabase/polls'

export function useContractVoters(contractId: string) {
  const [contractVoters, setContractVoters] = useState<User[] | undefined>(
    undefined
  )
  useEffect(() => {
    getContractVoters(contractId).then((voters) => {
      setContractVoters(voters)
    })
  }, [contractId])
  return contractVoters
}

export function useOptionVoters(contractId: string, optionId: string) {
  const [optionVoters, setOptionVoters] = useState<User[] | undefined>(
    undefined
  )
  useEffect(() => {
    getOptionVoters(contractId, optionId).then((voters) => {
      setOptionVoters(voters)
    })
  }, [contractId, optionId])
  return optionVoters
}
