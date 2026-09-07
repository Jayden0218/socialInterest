import { Module } from '@nestjs/common';
import { PostsModule } from '../posts/posts.module';
import { RatingsModule } from '../../ratings/ratings.module';
import { PlaceController } from './place.controller';
import { PlaceService } from './place.service';
import { PlacePostsService } from './place-posts.service';

/**
 * PostsModule is imported for PostQueryService - the place page hydrates its
 * posts through the same responder every other surface uses. Reaching for the
 * repository directly here is how a surface ends up returning candidate rows.
 */
@Module({
  imports: [PostsModule, RatingsModule],
  controllers: [PlaceController],
  providers: [PlaceService, PlacePostsService],
  exports: [PlaceService],
})
export class PlacesModule {}
