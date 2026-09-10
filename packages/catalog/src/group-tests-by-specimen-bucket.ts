import type { ExpandedOrderedTest } from "./expand-selection";
import type { CollectionType } from "./collection-type";
import {
  groupTestsByDepartment,
  type DepartmentLabelGroup,
} from "./group-tests-by-department";

export type SpecimenBucket = CollectionType;
export type SpecimenBucketGroup = DepartmentLabelGroup;

export { groupTestsByDepartment, type DepartmentLabelGroup };

/** @deprecated Use groupTestsByDepartment — one label per department, not serum buckets. */
export function groupTestsBySpecimenBucket(
  tests: ExpandedOrderedTest[],
): DepartmentLabelGroup[] {
  return groupTestsByDepartment(tests);
}
