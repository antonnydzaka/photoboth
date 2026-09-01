import { render, screen } from '@testing-library/react';
import App from './App';

test('shows start button when app loads', () => {
  render(<App />);
  expect(screen.getByText(/start/i)).toBeInTheDocument();
});
