import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { FeedbackProvider } from './components/ui/Feedback.jsx';
import './styles/tailwind.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <FeedbackProvider>
      <App />
    </FeedbackProvider>
  </React.StrictMode>
);
