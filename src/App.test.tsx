// import React from 'react'
import { render, screen } from '@testing-library/react'
import App from './App'
import { describe, it, expect } from 'vitest'
import userEvent from '@testing-library/user-event'
// import '@testing-library/jest-dom'

describe('Mock test', _ => {
  it('renders Header', _ => {
    render(<App />)
    expect(screen.getByText('Vite + React')).toBeInTheDocument()

  })

  it('add counter', async () => {
    render(<App />)

    const button = screen.getByRole('button', { name: /^count.*/i })

    expect(button.textContent).toEqual('count is 0')

    await userEvent.click(button)

    expect(button.textContent).toEqual('count is 1')

  })
})
