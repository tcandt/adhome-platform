import React, { useState } from 'react';
import {
  Shield,
  KeyRound,
  Mail,
  ArrowRight,
  Eye,
  EyeOff,
  Building2,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { BrandLogo } from '@/shared/ui/BrandLogo';
import { useAuth } from '@/app/providers/AuthContext';
import { Role } from '@/shared/types/auth';

export const LoginPage: React.FC = () => {
  const { loginWithCredentials } = useAuth();
  const [email, setEmail] = useState('admin@adhome.ductinh.one');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [selectedRole, setSelectedRole] = useState<Role>('ORG_ADMIN');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      const res = await loginWithCredentials(email, password);
      if (!res.ok) {
        setErrorMsg(res.message || 'Email hoặc mật khẩu không chính xác.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickSelect = (role: Role) => {
    setSelectedRole(role);
    setErrorMsg(null);
    if (role === 'ORG_ADMIN') {
      setEmail('admin@adhome.ductinh.one');
    } else {
      setEmail('manager.lk01@adhome.vn');
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 select-none">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-3xl border border-appBorder-light dark:border-appBorder-dark shadow-elevated p-8">
        {/* Brand Header */}
        <div className="flex flex-col items-center text-center mb-6">
          <BrandLogo variant="stacked" className="mb-2" />
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
            Đăng nhập bảng điều khiển quản trị căn hộ dịch vụ
          </p>
        </div>

        {/* Quick Role Preset Selector for Testing & Demonstration */}
        <div className="mb-6 p-1.5 bg-slate-100 dark:bg-slate-800 rounded-xl flex gap-1">
          <button
            type="button"
            onClick={() => handleQuickSelect('ORG_ADMIN')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              selectedRole === 'ORG_ADMIN'
                ? 'bg-white dark:bg-slate-700 text-brand-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5" /> Admin (Toàn quyền)
          </button>
          <button
            type="button"
            onClick={() => handleQuickSelect('MANAGER')}
            className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
              selectedRole === 'MANAGER'
                ? 'bg-white dark:bg-slate-700 text-brand-primary shadow-sm'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Building2 className="w-3.5 h-3.5" /> Manager (Quản lý tòa)
          </button>
        </div>

        {/* Error Feedback */}
        {errorMsg && (
          <div
            data-testid="console-login-error"
            className="mb-4 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2"
          >
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1.5">
              Địa chỉ Email
            </label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                data-testid="console-login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full text-xs font-medium pl-10 pr-3 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-primary text-slate-900 dark:text-slate-100"
                placeholder="admin@adhome.ductinh.one"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Mật khẩu
              </label>
              <a
                href="#forgot"
                onClick={(e) => {
                  e.preventDefault();
                  alert('Liên hệ quản trị viên để cấp lại mật khẩu');
                }}
                className="text-[11px] text-brand-primary hover:underline"
              >
                Quên mật khẩu?
              </a>
            </div>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                data-testid="console-login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full text-xs font-medium pl-10 pr-10 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-primary text-slate-900 dark:text-slate-100"
                placeholder="Nhập mật khẩu an toàn..."
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between text-xs text-slate-500 py-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                defaultChecked
                className="rounded text-brand-primary focus:ring-0"
              />
              <span>Ghi nhớ phiên đăng nhập</span>
            </label>
          </div>

          <button
            data-testid="console-login-submit"
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3.5 rounded-xl bg-brand-primary hover:bg-brand-hover disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 group cursor-pointer"
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

        {/* Security & Audit notice */}
        <div className="mt-6 pt-4 border-t border-appBorder-light dark:border-appBorder-dark text-center">
          <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
            Hệ thống xác thực server capabilities RBAC an toàn
          </p>
        </div>
      </div>
    </div>
  );
};
