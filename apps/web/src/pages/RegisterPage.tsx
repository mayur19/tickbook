import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client.js';
import { useSession } from '../hooks/useSession.js';

export const RegisterPage = () => {
  const { login } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    organizationName: '',
    displayName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) =>
    setForm({ ...form, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('POST', '/api/v1/auth/register', form);
      await login(form.email, form.password);
      navigate('/trade');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed');
    }
  };

  return (
    <div className="auth-page">
      <form className="card auth-card" onSubmit={submit}>
        <h1>Register a firm</h1>
        <p className="muted">
          Your firm gets one paper-trading account funded with 1,000,000.00 simulated USD.
        </p>
        <label>
          Organization
          <input value={form.organizationName} onChange={set('organizationName')} required />
        </label>
        <label>
          Your name
          <input value={form.displayName} onChange={set('displayName')} required />
        </label>
        <label>
          Email
          <input type="email" value={form.email} onChange={set('email')} required />
        </label>
        <label>
          Password (12+ characters)
          <input
            type="password"
            minLength={12}
            value={form.password}
            onChange={set('password')}
            required
          />
        </label>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="primary">
          Create organization
        </button>
        <p className="small">
          <Link to="/login">Back to sign in</Link>
        </p>
      </form>
    </div>
  );
};
