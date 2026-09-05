import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors/problem.filter';
import { CATALOGUE_SEARCH, type CatalogueSearch } from './catalogue.cache';
import type { InterestItem } from '../../persistence/interest.repository';

/**
 * FR-020: the hierarchy is EXACTLY two levels - a curated top level, with
 * sub-interests beneath. spec.md records the depth as an Assumption, so this is
 * the place that enforces it: reject anything that would create a third level.
 */
@Injectable()
export class HierarchyValidator {
  constructor(@Inject(CATALOGUE_SEARCH) private readonly catalogue: CatalogueSearch) {}

  /** Resolves the parent, or explains precisely why it cannot be one. */
  requireTopLevelParent(parentId: string): InterestItem {
    const parent = this.catalogue.byId(parentId);
    if (!parent) {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Unknown parent interest',
        `No interest ${parentId}`,
      );
    }
    if (parent.level !== 'top') {
      // The third-level case. Naming it explicitly beats a generic rejection,
      // because "nest it deeper" is the natural thing for a person to try.
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Interests are only two levels deep',
        `"${parent.name}" is itself a sub-interest, so nothing can be nested beneath it. Choose a top-level interest as the parent.`,
      );
    }
    if (parent.state !== 'active') {
      throw new DomainError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'Parent interest unavailable',
        `"${parent.name}" is ${parent.state}`,
      );
    }
    return parent;
  }

  /** FR-021: only operators create the top level. */
  assertMayCreateTopLevel(isOperator: boolean): void {
    if (!isOperator) {
      throw new DomainError(
        HttpStatus.FORBIDDEN,
        'Operator authority required',
        'Top-level interests are curated. Anyone may create a sub-interest beneath one.',
      );
    }
  }
}
