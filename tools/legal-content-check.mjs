#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';

const rootDir = process.cwd();

function checkManifestParity() {
  console.log('--- Kiểm tra tính đồng bộ nội dung pháp lý (Legal Content Parity Check) ---');

  const backendManifestPath = resolve(
    rootDir,
    'backend/src/modules/legal-content/content/policy-manifest.json',
  );
  const frontendManifestPath = resolve(rootDir, 'frontend/content/legal/manifest.json');

  let backendManifest;
  let frontendManifest;

  try {
    backendManifest = JSON.parse(readFileSync(backendManifestPath, 'utf8'));
    console.log('✓ Backend policy-manifest.json hợp lệ.');
  } catch (err) {
    console.error('✗ Không thể đọc backend policy-manifest.json:', err.message);
    process.exit(1);
  }

  try {
    frontendManifest = JSON.parse(readFileSync(frontendManifestPath, 'utf8'));
    console.log('✓ Frontend manifest.json hợp lệ.');
  } catch (err) {
    console.error('✗ Không thể đọc frontend manifest.json:', err.message);
    process.exit(1);
  }

  // Check active booking bundle
  if (
    backendManifest.activeBookingBundle.id !== frontendManifest.activeBookingBundle.id ||
    backendManifest.activeBookingBundle.termsVersion !==
      frontendManifest.activeBookingBundle.termsVersion ||
    backendManifest.activeBookingBundle.refundPolicyVersion !==
      frontendManifest.activeBookingBundle.refundPolicyVersion ||
    backendManifest.activeBookingBundle.contentHash !==
      frontendManifest.activeBookingBundle.contentHash
  ) {
    console.error('✗ Lệch cấu hình activeBookingBundle giữa frontend và backend!');
    process.exit(1);
  }
  console.log(
    `✓ Đồng bộ activeBookingBundle: ${backendManifest.activeBookingBundle.id} (Terms: ${backendManifest.activeBookingBundle.termsVersion}, Refund: ${backendManifest.activeBookingBundle.refundPolicyVersion}, Hash: ${backendManifest.activeBookingBundle.contentHash.slice(0, 12)}…)`,
  );

  const policyKinds = ['privacy', 'terms', 'cookies', 'refund-policy'];

  for (const kind of policyKinds) {
    const backendPolicy = backendManifest.policies.find((p) => p.kind === kind);
    const frontendPolicy = frontendManifest.policies.find((p) => p.kind === kind);

    if (!backendPolicy || !frontendPolicy) {
      console.error(`✗ Thiếu policy descriptor cho ${kind}!`);
      process.exit(1);
    }

    if (backendPolicy.version !== frontendPolicy.version) {
      console.error(
        `✗ Lệch version cho ${kind}: backend=${backendPolicy.version}, frontend=${frontendPolicy.version}`,
      );
      process.exit(1);
    }

    const docPath = resolve(
      rootDir,
      `frontend/content/legal/vi/${kind}/${backendPolicy.version}.json`,
    );
    try {
      const content = readFileSync(docPath, 'utf8');
      const doc = JSON.parse(content);
      if (doc.kind !== kind || doc.version !== backendPolicy.version) {
        console.error(`✗ Thuộc tính kind/version trong ${docPath} không khớp!`);
        process.exit(1);
      }
      const actualHash = createHash('sha256').update(content).digest('hex');
      if (
        backendPolicy.sha256 !== actualHash ||
        frontendPolicy.sha256 !== actualHash
      ) {
        console.error(
          `✗ Lệch SHA256 hash cho ${kind}: actual=${actualHash}, backend=${backendPolicy.sha256}, frontend=${frontendPolicy.sha256}`,
        );
        process.exit(1);
      }
      console.log(`✓ Policy file tồn tại, đúng cấu trúc và khớp SHA256: vi/${kind}/${backendPolicy.version}.json (${actualHash.slice(0, 10)}…)`);
    } catch (err) {
      console.error(`✗ Không thể nạp policy file ${docPath}:`, err.message);
      process.exit(1);
    }
  }

  console.log('\n>>> Toàn bộ 4 chính sách pháp lý và manifest đạt tính toàn vẹn và đồng bộ!');
}

checkManifestParity();
