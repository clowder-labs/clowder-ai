'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/utils/api-client';
import { setUserId } from '@/utils/userId';

export default function LoginPage() {
  const [userType, setUserType] = useState<'huawei' | 'iam'>('huawei'); // 默认华为云用户
  const [userName, setUserName] = useState('');
  const [password, setPassword] = useState('');
  const [domainName, setDomainName] = useState(''); // 域名
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  // 检查是否已登录
  useEffect(() => {
    checkLoginStatus();
  }, []);

  const checkLoginStatus = async () => {
    try {
      const response = await apiFetch('/api/islogin');
      const data = await response.json();

      if (data.isLoggedIn) {
        // 已登录，跳转到首页
        router.replace('/');
      }
    } catch (err) {
      console.error('检查登录状态失败:', err);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      const loginData = userType === 'iam' 
        ? { userName, password, domainName, userType }
        : { password, domainName, userType };

      const response = await apiFetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(loginData),
      });

      const data = await response.json();
      console.log('login->', data);
      if (data.success) {
        // 设置用户ID到localStorage
        setUserId(data.userId);
        // 登录成功，跳转到首页
        router.replace('/');
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
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {userType === 'huawei' ? '华为账号登录' : 'IAM用户登录'}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            选择用户类型并输入登录信息
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleLogin}>
          {/* 用户类型选择 */}
          <div className="flex justify-center space-x-4">
            <button
              type="button"
              onClick={() => setUserType('huawei')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                userType === 'huawei'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              华为云用户
            </button>
            <button
              type="button"
              onClick={() => setUserType('iam')}
              className={`px-4 py-2 rounded-md text-sm font-medium ${
                userType === 'iam'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              IAM用户
            </button>
          </div>

          <div className="rounded-md shadow-sm -space-y-px">
            {/* 域名输入框 */}
            <div>
              <label htmlFor="domainName" className="sr-only">
                {userType === 'huawei' ? '华为云账号' : '租户名'}
              </label>
              <input
                id="domainName"
                name="domainName"
                type="text"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder={userType === 'huawei' ? '华为云账号' : '租户名'}
                value={domainName}
                onChange={(e) => setDomainName(e.target.value)}
              />
            </div>

            {/* 用户名输入框 - IAM用户时显示 */}
            {userType === 'iam' && (
              <div>
                <label htmlFor="userName" className="sr-only">
                  IAM用户名
                </label>
                <input
                  id="userName"
                  name="userName"
                  type="text"
                  required
                  className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                  placeholder="IAM用户名"
                  value={userName}
                  onChange={(e) => setUserName(e.target.value)}
                />
              </div>
            )}

            {/* 密码输入框 */}
            <div>
              <label htmlFor="password" className="sr-only">
                密码
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className={`appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 ${
                  userType === 'huawei' ? 'rounded-b-md' : ''
                } focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm`}
                placeholder="密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <div className="text-red-600 text-sm text-center">
              {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              disabled={isLoading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? '登录中...' : '登录'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}