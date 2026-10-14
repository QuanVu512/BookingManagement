import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { spec, request } from 'pactum';
import { AppModule } from '../src/app.module.js';

describe('AppController (e2e with Pactum)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    await app.listen(0);

    const url = await app.getUrl();
    request.setBaseUrl(url);
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return spec().get('/').expectStatus(200).expectBody('Hello World!');
  });
});
