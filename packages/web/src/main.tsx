import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'jsuites/dist/jsuites.css';
import 'jspreadsheet-ce/dist/jspreadsheet.css';
import './index.css';
import { branding } from './config/branding';

document.title = branding.appName;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
