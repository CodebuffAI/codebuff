import React, { useEffect } from 'react'

import { useDispatch, useSelector } from 'react-redux'

import { fetchTasks } from '../lib/store'

import TaskList from './TaskList'

import { AddNewTask } from './AddNewTask'

export default function InboxScreen() {
  const dispatch = useDispatch()
  // We're retrieving the error field from our updated store
  const { error } = useSelector((state) => state.taskbox)
  // The useEffect triggers the data fetching when the component is mounted
  useEffect(() => {
    dispatch(fetchTasks())
  }, [])

  if (error) {
    return (
      <div className="page lists-show">
        <div className="wrapper-message">
          <span className="icon-face-sad" />
          <p className="title-message">Oh no!</p>
          <p className="subtitle-message">Something went wrong</p>
        </div>
      </div>
    )
  }
  return (
    <div className="page lists-show">
      <nav>
        <h1 className="title-page">Taskbox App</h1>
        <AddNewTask />
      </nav>
      <TaskList />
    </div>
  )
}
