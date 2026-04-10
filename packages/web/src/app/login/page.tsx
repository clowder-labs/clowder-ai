'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/utils/api-client';
import { setIsSkipAuth, setUserId } from '@/utils/userId';

function PasswordEyeIcon({ visible }: { visible: boolean }) {
  if (visible) {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M3 3l18 18" strokeLinecap="round" strokeLinejoin="round" />
      <path
        d="M10.6 6.2A11.1 11.1 0 0 1 12 6c6.5 0 10 6 10 6a18.8 18.8 0 0 1-3.3 4.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M6.7 6.8C4.1 8.2 2 12 2 12s3.5 6 10 6c1 0 1.9-.1 2.8-.4" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.9 9.9A3 3 0 0 0 14.1 14.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LoginPage() {
  const [userType, setUserType] = useState<'huawei' | 'iam'>('huawei');
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [promotionCode, setPromotionCode] = useState('');
  const [hasCode, setHasCode] = useState(true);
  const [domainName, setDomainName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [agreeToTerms, setAgreeToTerms] = useState(true);
  const promotionCodeRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  // 检查是否已登录
  useEffect(() => {
    const checkLoginStatus = async () => {
      try {
        const response = await apiFetch('/api/islogin');
        const data = await response.json();
        setIsSkipAuth(Boolean(data?.isskip));
        setHasCode(Boolean(data?.hascode));

        if (data.islogin) {
          // 已登录则跳转到首页
          router.replace('/');
        }
      } catch (err) {
        console.error('检查登录状态失败:', err);
      }
    };
    void checkLoginStatus();
  }, [router]);

  useEffect(() => {
    if (!password) {
      setShowPassword(false);
    }
  }, [password]);

  const handleUserTypeChange = (nextUserType: 'huawei' | 'iam') => {
    setUserType(nextUserType);
    setDomainName('');
    setUserName('');
    setPassword('');
    setShowPassword(false);
    setError('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {

      const loginData =
        userType === 'iam' ? { userName, password, domainName, userType } : { password, domainName, userType };

      const response = await apiFetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ...loginData, promotionCode }),
      });

      const data = await response.json();
      console.log('login->', data);
      if (data.success) {
        // 设置用户 ID 到 localStorage
        setUserId(data.userId);
        // 登录成功后跳转到首页
        router.replace('/');
      } else if (data.needCode === true) {
        setHasCode(false);
        setError(data.message || '请输入邀请码后再登录');
        setTimeout(() => promotionCodeRef.current?.focus(), 0);
      } else {
        setError(data.message || '登录失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
      console.error('登录失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-white px-4 py-8 sm:px-6 md:px-8 lg:px-12 lg:py-10 xl:px-16">
      <div className="mx-auto flex w-full max-w-[1280px] flex-row items-center gap-4 sm:gap-6 md:gap-8 min-h-[calc(100vh-4rem)] lg:min-h-[calc(100vh-5rem)] lg:gap-12">
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
          <div className="flex w-full max-w-[760px] flex-col items-center">
            <div>
              <Image
                data-testid="login-hero-officeclaw-logo"
                src="/images/OfficeClaw.svg"
                alt="OfficeClaw"
                width={248}
                height={56}
                className="h-14 w-auto"
              />
            </div>
            <p className="mb-10 max-w-xl text-center text-xl font-semibold leading-10 text-gray-600 sm:text-2xl sm:leading-[48px]">
              即刻拥有专属 AI 享 7x24 小时 稳定在线的超级助手
            </p>

            <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
              <div className="w-full min-w-0">
                <div className="mb-3">
                  <Image src="/images/login1.svg" alt="AI PPT" width={32} height={32} />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">专业级 AI PPT 生产力</h3>
                <p className="text-sm text-gray-600 leading-relaxed">行业专业级 AI 生成能力，一键完成高质量 PPT。</p>
              </div>

              <div className="w-full min-w-0">
                <div className="mb-3">
                  <Image src="/images/login2.svg" alt="专家团思辨模式" width={32} height={32} />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">专家团思辨模式</h3>
                <p className="text-sm text-gray-600 leading-relaxed">
                  支持创建多角色，高效分工，零门槛组建专属专家团队。
                </p>
              </div>

              <div className="w-full min-w-0">
                <div className="mb-3">
                  <Image src="/images/login3.svg" alt="一键本地部署" width={32} height={32} />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">一键本地部署</h3>
                <p className="text-sm text-gray-600 leading-relaxed">具备本地文件读写能力，无缝处理多格式文件。</p>
              </div>

              <div className="w-full min-w-0">
                <div className="mb-3">
                  <Image src="/images/login4.svg" alt="多渠道接入" width={32} height={32} />
                </div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1">多渠道接入</h3>
                <p className="text-sm text-gray-600 leading-relaxed">可接入飞书、微信、钉钉、小艺等多渠道。</p>
              </div>
            </div>
          </div>
        </div>

        <div className="w-[clamp(280px,36vw,450px)] flex-shrink-0">
          <div className="mx-auto w-full rounded-xl border border-gray-200 bg-white p-6 shadow-lg sm:p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">欢迎使用 OfficeClaw</h2>
            </div>
            <form className="space-y-6" onSubmit={handleLogin}>
              <div className="space-y-4">
                {/* 域名输入框 */}
                <div>
                  <input
                    id="domainName"
                    name="domainName"
                    type="text"
                    required
                    className="ui-input appearance-none relative block w-full px-3 py-2 rounded-md sm:text-sm"
                    placeholder={userType === 'huawei' ? '华为云账号' : '租户名'}
                    value={domainName}
                    onChange={(e) => setDomainName(e.target.value)}
                  />
                </div>

                {/* 用户名输入框 - IAM用户时显示 */}
                {userType === 'iam' && (
                  <div>
                    <input
                      id="userName"
                      name="userName"
                      type="text"
                      required
                      className="ui-input appearance-none relative block w-full px-3 py-2 rounded-md sm:text-sm"
                      placeholder="IAM用户名"
                      value={userName}
                      onChange={(e) => setUserName(e.target.value)}
                    />
                  </div>
                )}

                {/* 密码输入框 */}
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    className="ui-input login-password-input appearance-none relative block w-full px-3 py-2 rounded-md sm:text-sm"
                    placeholder="密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onCopy={(event) => event.preventDefault()}
                    onCut={(event) => event.preventDefault()}
                  />
                  {password ? (
                    <button
                      type="button"
                      data-testid="login-password-visibility-toggle"
                      aria-label={showPassword ? '隐藏密码' : '显示密码'}
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[#8C95A6] transition-colors hover:text-[#4B5563]"
                    >
                      <span className="h-5 w-5">
                        <PasswordEyeIcon visible={showPassword} />
                      </span>
                    </button>
                  ) : null}
                </div>

                {!hasCode && (
                  <div>
                    <input
                      ref={promotionCodeRef}
                      id="promotionCode"
                      name="promotionCode"
                      type="text"
                      required
                      className="ui-input appearance-none relative block w-full px-3 py-2 rounded-md sm:text-sm"
                      placeholder="邀请码"
                      value={promotionCode}
                      onChange={(e) => setPromotionCode(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {error && <div className="text-red-600 text-sm text-center bg-red-50 p-2 rounded-md">{error}</div>}

              <div>
                <button
                  type="submit"
                  disabled={isLoading || !agreeToTerms}
                  className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLoading ? '登录中...' : '登录'}
                </button>
              </div>

              {/* 注册和忘记密码链接 */}
              <div className="text-center mt-3 hidden">
                <a
                  href="https://id1.cloud.huawei.com/UnifiedIDMPortal/portal/userRegister/regbyphone.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                  注册
                </a>
                <span className="text-sm text-gray-400 mx-2">|</span>
                <a
                  href="https://id5.cloud.huawei.com/UnifiedIDMPortal/portal/resetPwd/forgetbyid.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-indigo-600 hover:text-indigo-500"
                >
                  忘记密码
                </a>
              </div>

              {/* 分隔线 */}
              <div className="mt-3 mb-3">
                <div className="relative">
                  <div className="inset-0 flex items-center">
                    <div className="w-full border-t border-gray-300"></div>
                  </div>
                </div>
              </div>

              {/* 用户类型切换链接 */}
              <div className="text-center mb-2">
                <span className="text-sm text-gray-600">
                  {userType === 'huawei' ? (
                    <>
                      使用 IAM 用户登录？{' '}
                      <button
                        type="button"
                        onClick={() => handleUserTypeChange('iam')}
                        className="text-indigo-600 hover:text-indigo-500 font-medium"
                      >
                        切换到 IAM
                      </button>
                    </>
                  ) : (
                    <>
                      使用华为云账号登录？{' '}
                      <button
                        type="button"
                        onClick={() => handleUserTypeChange('huawei')}
                        className="text-indigo-600 hover:text-indigo-500 font-medium"
                      >
                        切换到华为云
                      </button>
                    </>
                  )}
                </span>
              </div>

              {/* 同意条款复选框 */}
              <div className="flex items-start hidden">
                <div className="flex items-center h-5">
                  <input
                    id="agreeToTerms"
                    name="agreeToTerms"
                    type="checkbox"
                    checked={agreeToTerms}
                    onChange={(e) => setAgreeToTerms(e.target.checked)}
                    className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
                  />
                </div>
                <div className="ml-3 text-sm">
                  <label htmlFor="agreeToTerms" className="text-gray-700">
                    我已阅读并同意上述内容及
                    <a href="#" className="text-indigo-600 hover:text-indigo-500">
                      《用户协议》
                    </a>
                    与
                    <a href="#" className="text-indigo-600 hover:text-indigo-500">
                      《隐私声明》
                    </a>
                  </label>
                </div>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}


