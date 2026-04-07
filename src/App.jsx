import React from 'react';
import DocumentManager from './components/DocumentManager';
import { FileText } from 'lucide-react';
import { SpeedInsights } from "@vercel/speed-insights/react"
import './index.css';

function App() {
  return (
    <div className="app-container">
      <header className="header">
        <FileText size={32} />
        <h1>Automated Document Generator</h1>
      </header>
      
      <main>
        <DocumentManager />
      </main>
      <SpeedInsights />
    </div>
  );
}

export default App;
