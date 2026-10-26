import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { UserController } from './user.controller.js';
import { UserService } from './user.service.js';
import { GetMyProfileUseCase } from './application/get-my-profile.use-case.js';
import { UpdateMyProfileUseCase } from './application/update-my-profile.use-case.js';
import { ProfileController } from './presentation/profile.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [UserController, ProfileController],
  providers: [UserService, GetMyProfileUseCase, UpdateMyProfileUseCase],
})
export class UserModule {}
