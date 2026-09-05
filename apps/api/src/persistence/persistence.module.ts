import { Global, Module, type Provider } from '@nestjs/common';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { CONFIG, type AppConfig } from '../config/configuration';
import { createDocumentClient, DOC_CLIENT } from './dynamo-client';
import { PersonRepository } from './person.repository';
import { InterestRepository } from './interest.repository';
import { PersonFollowRepository } from './person-follow.repository';
import { BlockRepository } from './block.repository';

const repo = <T>(
  cls: new (doc: DynamoDBDocumentClient, table: string) => T,
): Provider => ({
  provide: cls,
  inject: [DOC_CLIENT, CONFIG],
  useFactory: (doc: DynamoDBDocumentClient, config: AppConfig) =>
    new cls(doc, config.dynamo.tableName),
});

const providers: Provider[] = [
  { provide: DOC_CLIENT, inject: [CONFIG], useFactory: createDocumentClient },
  repo(PersonRepository),
  repo(InterestRepository),
  repo(PersonFollowRepository),
  repo(BlockRepository),
];

@Global()
@Module({
  providers,
  exports: [DOC_CLIENT, PersonRepository, InterestRepository, PersonFollowRepository, BlockRepository],
})
export class PersistenceModule {}
