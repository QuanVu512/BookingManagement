import React from 'react';
import Link from 'next/link';
import type { PolicyDocument as PolicyDocType } from '../model/policy-document';
import styles from './legal.module.css';

interface PolicyDocumentProps {
  document: PolicyDocType;
}

export const PolicyDocument: React.FC<PolicyDocumentProps> = ({ document }) => {
  const formattedEffectiveDate = new Date(document.effectiveAt).toLocaleDateString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  return (
    <article className={styles.article} aria-labelledby="policy-main-heading">
      <header className={styles.header}>
        <div style={{ marginBottom: '0.75rem' }}>
          <span className={styles.badge}>Phiên bản {document.version}</span>
        </div>
        <h1 id="policy-main-heading" className={styles.title}>
          {document.title}
        </h1>
        <p className={styles.description}>{document.description}</p>
        <div className={styles.metaRow}>
          <div className={styles.metaItem}>
            <span>Ngày có hiệu lực:</span>
            <time dateTime={document.effectiveAt}>{formattedEffectiveDate}</time>
          </div>
          <div className={styles.metaItem}>
            <span>Trạng thái:</span>
            <span>{document.publicationStatus === 'PUBLISHED' ? 'Đã ban hành' : 'Bản nháp'}</span>
          </div>
        </div>
      </header>

      {document.sections.length > 2 && (
        <nav className={styles.toc} aria-label="Mục lục chính sách">
          <h2 className={styles.tocTitle}>Mục lục nội dung</h2>
          <ul className={styles.tocList}>
            {document.sections.map((section) => (
              <li key={section.id}>
                <a href={`#${section.id}`} className={styles.tocLink}>
                  {section.title}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <div className={styles.articleBody}>
        {document.sections.map((section) => (
          <section key={section.id} id={section.id} className={styles.section} aria-labelledby={`heading-${section.id}`}>
            <h2 id={`heading-${section.id}`} className={styles.sectionHeading}>
              {section.title}
            </h2>
            <p className={styles.sectionContent}>{section.content}</p>

            {section.subsections && section.subsections.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', marginTop: '1rem' }}>
                {section.subsections.map((sub) => (
                  <div key={sub.id} id={sub.id} className={styles.subsection}>
                    <h3 className={styles.subsectionHeading}>{sub.title}</h3>
                    <p className={styles.subsectionContent}>{sub.content}</p>
                  </div>
                ))}
              </div>
            )}
          </section>
        ))}
      </div>

      <footer className={styles.footerNote}>
        <div>
          <span>Mọi thắc mắc vui lòng liên hệ </span>
          <Link href="/support" className={styles.noticeLink}>
            Trung tâm hỗ trợ
          </Link>
          <span> hoặc gửi </span>
          <Link href="/privacy/requests" className={styles.noticeLink}>
            Yêu cầu quyền riêng tư
          </Link>
        </div>
        <div className={styles.metaItem}>
          <span>Mã tài liệu: {document.kind}-{document.version}</span>
        </div>
      </footer>
    </article>
  );
};
