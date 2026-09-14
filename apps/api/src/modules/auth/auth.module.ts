import { Module } from '@nestjs/common';
import { AdaptersModule } from '../../adapters/adapters.module';
import { PersistenceModule } from '../../persistence/persistence.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

/**
 * 011/T016. The one new module.
 *
 * `auth` is the only thing that may touch a credential row, and nothing outside
 * it reads one. That boundary is the whole of the module: there is no exported
 * service, because nothing else in the product has any business minting or
 * verifying a password.
 */
@Module({
  imports: [AdaptersModule, PersistenceModule],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
