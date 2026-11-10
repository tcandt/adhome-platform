import React, { useState } from 'react';
import {
  KeyRound,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react';
import { BrandWordmark } from '@/shared/ui/BrandWordmark';
import { BrandMark } from '@/shared/ui/BrandMark';
import { useAuth } from '@/app/providers/AuthContext';

export const LoginPage: React.FC = () => {
  const { loginWithCredentials } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showForgotNotice, setShowForgotNotice] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      const res = await loginWithCredentials(email, password, rememberMe);
      if (!res.ok) {
        setErrorMsg(res.message || 'Email hoặc mật khẩu không chính xác.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-blue-50/30 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xl p-6 sm:p-8">
        {/* Official Brand Header — Unified Login (Zero Role Tabs) */}
        <div className="flex flex-col items-center text-center mb-6">
          <div data-brand-dock="console-login" className="flex flex-col items-center">
            <div className="w-12 h-12 rounded-2xl bg-blue-50 dark:bg-slate-800 border border-blue-100/80 dark:border-slate-700 flex items-center justify-center mb-2.5 shadow-2xs">
              <BrandMark testId="header-brand-logo-img" className="h-8 w-8 select-none" />
            </div>
            <BrandWordmark className="h-auto w-[118px]" />
          </div>
          <span className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-brand-primary mt-1.5">
            QUẢN LÝ CĂN HỘ DỊCH VỤ
          </span>
          <h1
            data-testid="console-login-heading"
            className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 mt-3"
          >
            Đăng nhập hệ thống quản lý AdHome
          </h1>
        </div>

        {/* Forgot Password Guidance */}
        {showForgotNotice && (
          <div
            data-testid="console-forgot-password-notice"
            className="mb-4 p-3 rounded-xl bg-blue-50/80 dark:bg-blue-950/40 border border-blue-200/80 dark:border-blue-800 text-blue-800 dark:text-blue-200 text-xs flex items-start gap-2"
          >
            <Info className="w-4 h-4 shrink-0 mt-0.5 text-brand-primary" />
            <span>
              Vui lòng liên hệ Quản trị viên tổ chức (Admin) để cấp lại mật khẩu
              hoặc mở khóa tài khoản nhân sự trong phân hệ{' '}
              <strong>Cài đặt &amp; Phân quyền</strong>.
            </span>
          </div>
        )}

        {/* Error Feedback */}
        {errorMsg && (
          <div
            data-testid="console-login-error"
            role="alert"
            className="mb-4 p-3.5 rounded-xl bg-rose-50/90 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-900/60 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2.5"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Unified Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="console-login-email"
              className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1.5"
            >
              Email hoặc tên đăng nhập
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="console-login-email"
                data-testid="console-login-email"
                type="text"
                inputMode="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full text-xs font-medium pl-10 pr-3 py-2.5 rounded-xl bg-slate-50/60 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-brand-primary focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-950 text-slate-900 dark:text-slate-100 transition-colors"
                placeholder="admin@adhome.vn"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="console-login-password"
                className="text-xs font-semibold text-slate-700 dark:text-slate-300"
              >
                Mật khẩu
              </label>
              <button
                type="button"
                onClick={() => setShowForgotNotice((v) => !v)}
                className="text-[11px] font-semibold text-brand-primary hover:underline"
              >
                Quên mật khẩu?
              </button>
            </div>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="console-login-password"
                data-testid="console-login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full text-xs font-medium pl-10 pr-10 py-2.5 rounded-xl bg-slate-50/60 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700 focus:outline-none focus:bg-white dark:focus:bg-slate-800 focus:border-brand-primary focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-950 text-slate-900 dark:text-slate-100 transition-colors"
                placeholder="Nhập mật khẩu tài khoản..."
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 py-0.5">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                data-testid="console-login-remember"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="rounded border-slate-300 text-brand-primary focus:ring-0"
              />
              <span>Ghi nhớ đăng nhập</span>
            </label>
          </div>

          <button
            data-testid="console-login-submit"
            type="submit"
            disabled={isSubmitting}
            className="w-full min-h-[44px] rounded-xl bg-brand-primary hover:bg-brand-hover disabled:opacity-50 text-white text-xs font-bold transition-all shadow-2xs hover:shadow-xs active:scale-98 flex items-center justify-center gap-2 group cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang xác thực...</span>
              </>
            ) : (
              <>
                <span>Đăng nhập vào Console</span>
                <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </button>
        </form>

        {/* Server-Derived RBAC Notice */}
        <div className="mt-5 pt-3.5 border-t border-slate-100 dark:border-slate-800 text-center">
          <p
            data-testid="console-login-rbac-note"
            className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1.5"
          >
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>Quyền truy cập được xác định tự động sau khi xác thực</span>
          </p>
        </div>
      </div>
    </div>
  );
};
