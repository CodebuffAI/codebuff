import { LoverRow } from 'common/love/lover'

const isPreferredGender = (
  preferredGenders: string[] | undefined,
  gender: string | undefined
) => {
  if (preferredGenders === undefined || gender === undefined) return true

  // If simple gender preference, don't include non-binary.
  if (
    preferredGenders.length === 1 &&
    (preferredGenders[0] === 'male' || preferredGenders[0] === 'female')
  ) {
    return preferredGenders.includes(gender)
  }
  return preferredGenders.includes(gender) || gender === 'non-binary'
}

export const areGenderCompatible = (lover1: LoverRow, lover2: LoverRow) => {
  return (
    isPreferredGender(lover1.pref_gender, lover2.gender) &&
    isPreferredGender(lover2.pref_gender, lover1.gender)
  )
}

const satisfiesAgeRange = (lover: LoverRow, age: number) => {
  return age >= lover.pref_age_min && age <= lover.pref_age_max
}

export const areAgeCompatible = (lover1: LoverRow, lover2: LoverRow) => {
  return (
    satisfiesAgeRange(lover1, lover2.age) &&
    satisfiesAgeRange(lover2, lover1.age)
  )
}

export const areLocationCompatible = (lover1: LoverRow, lover2: LoverRow) => {
  if (
    !lover1.city_latitude ||
    !lover2.city_latitude ||
    !lover1.city_longitude ||
    !lover2.city_longitude
  )
    return lover1.city.trim().toLowerCase() === lover2.city.trim().toLowerCase()

  const latitudeDiff = Math.abs(lover1.city_latitude - lover2.city_latitude)
  const longigudeDiff = Math.abs(lover1.city_longitude - lover2.city_longitude)

  const root = (latitudeDiff ** 2 + longigudeDiff ** 2) ** 0.5
  return root < 2.5
}

export const areRelationshipStyleCompatible = (
  lover1: LoverRow,
  lover2: LoverRow
) => {
  return lover1.pref_relation_styles.some((style) =>
    lover2.pref_relation_styles.includes(style)
  )
}

export const areWantKidsCompatible = (lover1: LoverRow, lover2: LoverRow) => {
  const { wants_kids_strength: kids1 } = lover1
  const { wants_kids_strength: kids2 } = lover2

  if (kids1 === undefined || kids2 === undefined) return true

  const diff = Math.abs(kids1 - kids2)
  return diff <= 2
}
