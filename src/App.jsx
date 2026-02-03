import { useState } from 'react';
import Login from './components/Login/Login';
import Signup from './components/signup/Signup';
import AiBot from './components/Ai-Bot/Ai';
import './App.css';

function App() {
  const [currentScreen, setCurrentScreen] = useState('login');
  const [username, setUsername] = useState(() => localStorage.getItem('username') || '');
  const [isLoggedIn, setIsLoggedIn] = useState(() => Boolean(localStorage.getItem('username')));

  const handleSwitchToSignup = () => {
    setCurrentScreen('signup');
  };

  const handleSwitchToLogin = () => {
    setCurrentScreen('login');
  };

  const handleLoginSuccess = (loggedInUsername) => {
    setUsername(loggedInUsername);
    setIsLoggedIn(true);
    console.log('Login successful! Username:', loggedInUsername);
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    setUsername('');
    setIsLoggedIn(false);
    setCurrentScreen('login');
  };

  if (isLoggedIn) {
    return <AiBot username={username} onLogout={handleLogout} />;
  }

  return (
    <div className="app-container">
      <div className="screen-container">
        {currentScreen === 'login' ? (
          <Login
            onSwitchToSignup={handleSwitchToSignup}
            onLoginSuccess={handleLoginSuccess}
          />
        ) : (
          <Signup onSwitchToLogin={handleSwitchToLogin} />
        )}
      </div>
    </div>
  );
}

export default App;