import React from 'react'
import DemoPage from './pages/demo'
import ResponsiveBox from './ui/ResponsiveBox'

type Props = {
  name?: string
  showDemo?: boolean
}

const App = ({ showDemo = true }: Props) => {
  return (
    <ResponsiveBox>
      <DemoPage />
    </ResponsiveBox>
  )
}

export default App
