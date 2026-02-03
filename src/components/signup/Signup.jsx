import { useState } from 'react';
import './Signup.css';

function Signup({ onSwitchToLogin }) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeatPassword, setRepeatPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleBackClick = () => {
    onSwitchToLogin();
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const toggleRepeatPasswordVisibility = () => {
    setShowRepeatPassword(!showRepeatPassword);
  };

  const handleSignup = async (e) => {
    e.preventDefault();

    if (!fullName || !email || !password || !repeatPassword) {
      alert('Please fill in all fields');
      return;
    }

    if (password !== repeatPassword) {
      alert('Passwords do not match');
      return;
    }

    if (password.length < 6) {
      alert('Password must be at least 6 characters long');
      return;
    }

    setIsLoading(true);

    try {
      const username = email.trim().toLowerCase();

      const raw = localStorage.getItem('users');
      const users = raw ? JSON.parse(raw) : [];
      const safeUsers = Array.isArray(users) ? users : [];

      const exists = safeUsers.some((u) => (u?.username ?? '').toLowerCase() === username);
      if (exists) {
        alert('Account already exists. Please login.');
        onSwitchToLogin();
        return;
      }

      const nextUsers = [
        ...safeUsers,
        {
          username,
          fullName: fullName.trim(),
          password,
        },
      ];

      localStorage.setItem('users', JSON.stringify(nextUsers));
      await new Promise((resolve) => setTimeout(resolve, 400));

      alert('Account created successfully! Please login.');
      onSwitchToLogin();

      setFullName('');
      setEmail('');
      setPassword('');
      setRepeatPassword('');
    } catch (error) {
      console.error('Signup error:', error);
      alert('Signup failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e, nextAction) => {
    if (e.key === 'Enter') {
      if (nextAction === 'submit') {
        handleSignup(e);
      } else if (nextAction === 'focusEmail') {
        document.getElementById('emailAddressInput').focus();
      } else if (nextAction === 'focusPassword') {
        document.getElementById('signupPasswordInput').focus();
      } else if (nextAction === 'focusRepeatPassword') {
        document.getElementById('repeatPasswordInput').focus();
      }
    }
  };

  return (
    <div className="signup-screen">
      {/* Header Area */}
      <div className="header-area">
        <button className="icon" id="backArrowSignup" onClick={handleBackClick}>
          ←
        </button>
        <h2 className="header-title" id="signupHeaderTitle">
          Sign Up
        </h2>
      </div>

      {/* Main Content */}
      <div className="main-content">
        <h1 className="screen-title" id="createAccountTitle">Create Account</h1>
        <p className="screen-subtitle" id="createAccountSubtitle">
          Enter your details to get started
        </p>

        {/* Input Fields Section */}
        <form onSubmit={handleSignup} className="input-section">
          <input
            type="text"
            className="text-input"
            id="fullNameInput"
            placeholder="Full Name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onKeyPress={(e) => handleKeyPress(e, 'focusEmail')}
            autoComplete="name"
          />

          <input
            type="email"
            className="text-input"
            id="emailAddressInput"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyPress={(e) => handleKeyPress(e, 'focusPassword')}
            autoComplete="email"
          />

          <div className="password-input-wrapper">
            <input
              type={showPassword ? 'text' : 'password'}
              className="text-input"
              id="signupPasswordInput"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyPress={(e) => handleKeyPress(e, 'focusRepeatPassword')}
              autoComplete="new-password"
            />
            <span
              className="password-toggle-icon"
              id="toggleSignupPasswordVisibility"
              onClick={togglePasswordVisibility}
            >
              {showPassword ? '🙈' : '👁️'}
            </span>
          </div>

          <div className="password-input-wrapper">
            <input
              type={showRepeatPassword ? 'text' : 'password'}
              className="text-input"
              id="repeatPasswordInput"
              placeholder="Repeat Password"
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              onKeyPress={(e) => handleKeyPress(e, 'submit')}
              autoComplete="new-password"
            />
            <span
              className="password-toggle-icon"
              id="toggleRepeatPasswordVisibility"
              onClick={toggleRepeatPasswordVisibility}
            >
              {showRepeatPassword ? '🙈' : '👁️'}
            </span>
          </div>

          {/* Create Account Button */}
          <button
            type="submit"
            className="primary-button"
            id="createAccountButton"
            disabled={isLoading}
          >
            {isLoading ? 'Creating Account...' : 'Create Account'}
          </button>
        </form>

        {/* Footer Area */}
        <div className="footer-area">
          <span className="footer-text">Already have an account?</span>
          <a
            href="#"
            className="footer-link"
            id="loginLink"
            onClick={(e) => {
              e.preventDefault();
              onSwitchToLogin();
            }}
          >
            Log In
          </a>
        </div>
      </div>
    </div>
  );
}

export default Signup;
