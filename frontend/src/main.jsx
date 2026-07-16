// src/main.jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import './index.css'
import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { Toaster } from 'react-hot-toast'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <App />
          <Toaster
            position="bottom-center"
            gutter={12}
            containerStyle={{ zIndex: 99999, bottom: 40 }}
            toastOptions={{
              duration: 4000,
              className:
                "!bg-white dark:!bg-slate-900 !text-slate-800 dark:!text-slate-100 !border !border-slate-200 dark:!border-slate-700 !shadow-lg",
              style: {
                borderRadius: "14px",
                padding: "14px 18px",
                maxWidth: "min(100vw - 32px, 380px)",
              },
              success: {
                iconTheme: { primary: "#16a34a", secondary: "#fff" },
              },
              error: {
                iconTheme: { primary: "#dc2626", secondary: "#fff" },
              },
            }}
          />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </React.StrictMode>,
)
