import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap()
  .then(() => console.log('API is running...'))
  .catch((err) => console.error('Error starting API:', err))
  .finally(() => console.log('Bootstrap process completed.'));
