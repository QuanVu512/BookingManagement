'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { PrivacyRequestForm } from '../../../features/privacy/components/privacy-request-form';
import { PrivacyRequestStatusList } from '../../../features/privacy/components/privacy-request-status';
import { CookiePreferencesTrigger } from '../../../features/legal/components/cookie-preferences-trigger';

export default function AccountPrivacyPage() {
  const [activeTab, setActiveTab] = useState<'list' | 'new'>('list');

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto', padding: '0 1.5rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href="/account" style={{ color: 'var(--accent-volt, #a3e635)', textDecoration: 'underline', fontSize: '0.875rem' }}>
          ← Về trung tâm tài khoản
        </Link>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: '0.75rem 0 0.5rem', color: 'var(--ink, #f8fafc)' }}>
          Quyền riêng tư & Bảo vệ dữ liệu cá nhân
        </h1>
        <p style={{ color: 'var(--text-secondary, #94a3b8)', lineHeight: 1.6 }}>
          Quản lý quyền dữ liệu cá nhân, theo dõi các yêu cầu đã gửi và thiết lập tùy chọn lưu trữ cookie của bạn.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '1rem', borderBottom: '1px solid var(--line, rgba(255, 255, 255, 0.08))', marginBottom: '2rem' }}>
        <button
          type="button"
          onClick={() => setActiveTab('list')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 1rem',
            color: activeTab === 'list' ? 'var(--accent-volt, #a3e635)' : 'var(--text-secondary, #94a3b8)',
            borderBottom: activeTab === 'list' ? '2px solid var(--accent-volt, #a3e635)' : 'none',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Hồ sơ yêu cầu của tôi
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('new')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 1rem',
            color: activeTab === 'new' ? 'var(--accent-volt, #a3e635)' : 'var(--text-secondary, #94a3b8)',
            borderBottom: activeTab === 'new' ? '2px solid var(--accent-volt, #a3e635)' : 'none',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Tạo yêu cầu quyền mới
        </button>
      </div>

      {activeTab === 'list' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>Lịch sử yêu cầu đã gửi</h2>
            <div style={{ fontSize: '0.875rem' }}>
              <span>Cài đặt cookie: </span>
              <CookiePreferencesTrigger />
            </div>
          </div>
          <PrivacyRequestStatusList />
        </div>
      ) : (
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>Gửi yêu cầu thực thi quyền dữ liệu</h2>
          <PrivacyRequestForm onSubmitted={() => setActiveTab('list')} />
        </div>
      )}
    </div>
  );
}
