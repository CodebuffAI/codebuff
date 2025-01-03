import React from 'react'
import ChatPage from './pages/chat'
import ResponsiveBox from './ui/ResponsiveBox'

type Props = {
  name?: string
}

const App = ({ name }: Props) => {
  return (
    <ResponsiveBox>
      <ChatPage />
    </ResponsiveBox>
  )
}

export default App
