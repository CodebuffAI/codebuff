import { Combobox } from '@headlessui/react'
import { getCodeList } from 'country-list'
import { useState } from 'react'
import { Row } from 'web/components/layout/row'
import { XIcon } from '@heroicons/react/outline'

const countries = getCodeList()

export const CountryCodeSelector = (props: {
  setSelectedCountry: (code: string) => void
  selectedCountry: string
}) => {
  const { setSelectedCountry, selectedCountry } = props
  const [query, setQuery] = useState('')

  const filteredCountries =
    query === ''
      ? Object.entries(countries)
      : Object.entries(countries).filter(
          ([code, country]) =>
            country.toLowerCase().includes(query.toLowerCase()) ||
            code.toLowerCase().includes(query.toLowerCase())
        )
  const displayCountry = (code: string) =>
    code === ''
      ? ''
      : `${countries[code.toLowerCase()]} (${code.toUpperCase()})`
  return (
    <Row className="relative">
      <Combobox value={selectedCountry} onChange={setSelectedCountry}>
        <Combobox.Input
          className="w-full rounded-md border border-gray-300 px-4 py-3 focus:border-blue-300 focus:outline-none focus:ring md:text-sm"
          onChange={(e) => setQuery(e.target.value)}
          displayValue={displayCountry}
          placeholder="The country of which you are a citizen"
        />
        {selectedCountry !== '' && (
          <button onClick={() => setSelectedCountry('')}>
            <XIcon className="absolute right-3 top-3 h-5 w-5 text-gray-400" />
          </button>
        )}
        <Combobox.Options className="absolute mt-1 max-h-60 overflow-auto rounded-md bg-white py-1 shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none md:text-sm ">
          {filteredCountries.map(([code, country]) => (
            <Combobox.Option
              key={code}
              value={code.toUpperCase()}
              className={({ active }) =>
                `relative cursor-default select-none py-2 pl-10 pr-4 ${
                  active ? 'bg-blue-600 text-white' : 'text-gray-900'
                }`
              }
            >
              {({ selected, active }) => (
                <>
                  <span
                    className={`block truncate ${
                      selected ? 'font-medium' : 'font-normal'
                    }`}
                  >
                    {country} ({code.toUpperCase()})
                  </span>
                  {selected ? (
                    <span
                      className={`absolute inset-y-0 left-0 flex items-center pl-3 ${
                        active ? 'text-white' : 'text-blue-600'
                      }`}
                    >
                      ✓
                    </span>
                  ) : null}
                </>
              )}
            </Combobox.Option>
          ))}
        </Combobox.Options>
      </Combobox>
    </Row>
  )
}
