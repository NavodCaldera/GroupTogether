import { inSubtree, resolveNeedsApproval, type Tree } from "./categories";

/**
 * Factory category approval (CATG-003, DEC-029): approving a category covers its whole subtree, so
 * a factory may list in a category when it or any ancestor is approved for that factory.
 */
export const coveredBy = (tree: Tree, approvedIds: readonly string[], categoryId: string) =>
  approvedIds.some((rootId) => inSubtree(tree, categoryId, rootId));

/** A restricted category (needsApproval here or above) is approved only with a product licence. */
export const needsLicence = (tree: Tree, categoryId: string) =>
  resolveNeedsApproval(tree, categoryId);
