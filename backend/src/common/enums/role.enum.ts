// Account TYPE only. Representative status and leadership roles are scoped
// grants tracked separately (Representative / LeadershipRole tables) -- a
// STUDENT can also be a Representative or Department President. Don't add
// those here; that's what leads back to a role-inheritance graph.
export enum Role {
  SUPER_ADMIN = 'SUPER_ADMIN',
  UNIVERSITY_ADMIN = 'UNIVERSITY_ADMIN',
  LECTURER = 'LECTURER',
  STUDENT = 'STUDENT',
}
