import React from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { T } from '../../i18n/LanguageContext.jsx'

// App-root error boundary. Catches render/lifecycle throws anywhere below it and
// shows a friendly fallback with a Reload action instead of a blank white page.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    // Surface the failure for debugging; the UI still shows the fallback.
    console.error('Unhandled UI error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen grid place-items-center bg-cream/40 p-6">
          <div className="max-w-md w-full bg-white rounded-xl border border-gray-100 shadow-sm p-8 text-center">
            <div className="w-14 h-14 rounded-full bg-red-50 text-red-600 grid place-items-center mx-auto mb-4">
              <AlertTriangle size={26} />
            </div>
            <h1 className="font-serif text-xl font-bold text-maroon-800"><T>Something went wrong on this screen</T></h1>
            <p className="text-sm text-gray-500 mt-2"><T>An unexpected error occurred while displaying this page. Your data is safe — please reload to try again.</T>{' '}</p>
            <button onClick={() => window.location.reload()} className="btn-maroon !py-2.5 mt-5 mx-auto">
              <RefreshCw size={15} />{' '}<T>Reload</T>{' '}</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
