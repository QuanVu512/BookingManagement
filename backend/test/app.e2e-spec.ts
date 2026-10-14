import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { spec, request } from 'pactum';

const E2E_BOOTSTRAP_TIMEOUT_MS = 30_000;

describe('AppController (e2e with Pactum)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Load CJS integrations after Nest's ESM runtime has initialized in Jest.
    const { AppModule } = await import('../src/app.module.js');
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(0);

    const url = await app.getUrl();
    request.setBaseUrl(url);
  }, E2E_BOOTSTRAP_TIMEOUT_MS);

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return spec().get('/').expectStatus(200).expectBody('Hello World!');
  });
});
