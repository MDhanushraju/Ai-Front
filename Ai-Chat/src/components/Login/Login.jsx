import { useState } from 'react';
import './Login.css';

function Login({ onSwitchToSignup, onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleBackClick = () => {
    // Add your back navigation logic here
    console.log('Back from login');
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    
    if (!email || !password) {
      alert('Please fill in all fields');
      return;
    }

    setIsLoading(true);

    try {
      const raw = localStorage.getItem('users');
      const users = raw ? JSON.parse(raw) : [];

      const found = users.find(
        (u) => u?.username === email.trim() && u?.password === password
      );

      if (!found) {
        alert('User not found. Please Sign Up first.');
        return;
      }

      // Store current user for session
      localStorage.setItem('username', found.username);

      // Open AI page (App.jsx will render AiBot when isLoggedIn=true)
      onLoginSuccess?.(found.username);
    } catch (error) {
      console.error('Login error:', error);
      alert('Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e, nextAction) => {
    if (e.key === 'Enter') {
      if (nextAction === 'submit') {
        handleLogin(e);
      } else if (nextAction === 'focusPassword') {
        document.getElementById('passwordInput').focus();
      }
    }
  };

  return (
    <div className="login-screen">
      {/* Header Area */}
      <div className="header-area">
        <button className="icon" id="backArrowLogin" onClick={handleBackClick}>
          ←
        </button>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <h1 className="screen-title" id="welcomeTitle">Welcome</h1>
        <p className="screen-subtitle" id="welcomeSubtitle">Sign in to your account</p>

        {/* Input Fields Section */}
        <form onSubmit={handleLogin} className="input-section">
          <input
            type="email"
            className="text-input"
            id="emailInput"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyPress={(e) => handleKeyPress(e, 'focusPassword')}
            autoComplete="email"
          />

          <div className="password-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              className="text-input"
              id="passwordInput"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => handleKeyPress(e, 'submit')}
              autoComplete="current-password"
            />
            <span
              className="password-toggle-icon"
              id="togglePasswordVisibilityLogin"
              onClick={togglePasswordVisibility}
            >
              {showPassword ? '🙈' : '👁️'}
            </span>
          </div>

          {/* Action Link */}
          <div className="action-link-container">
            <a href="#" className="action-link" id="forgotPasswordLink">
              Forgot Password?
            </a>
          </div>

          {/* Login Button */}
          <button
            type="submit"
            className="primary-button"
            id="loginButton"
            disabled={isLoading}
          >
            {isLoading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        {/* Footer Area */}
        <div className="footer-area">
          <span className="footer-text">Don't have an account?</span>
          <a
            href="#"
            className="footer-link"
            id="signUpLink"
            onClick={(e) => {
              e.preventDefault();
              onSwitchToSignup();
            }}
          >
            Sign Up
          </a>
        </div>
      </div>
    </div>
  );
}

export default Login;
