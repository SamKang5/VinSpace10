import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import UIDemo from './components/UIDemo';
import './styles.css';

const Root = window.location.hash === '#demo' ? UIDemo : App;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
