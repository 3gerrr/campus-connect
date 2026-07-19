/**
 * Standalone correctness test for src/common/merkle-tree.ts. Runs
 * independently of Nest, the database, or any HTTP server -- it's pure
 * function testing of the cryptographic core.
 *
 * Run with: npx ts-node scripts/verify-merkle-tree.ts
 *
 * This is the actual test that caught a real bug during development (the
 * consistency-proof verifier's `m === n, b === false` base case returned
 * `null` for subRoot when it should equal the reconstructed hash) -- it's
 * kept in the repo so anyone modifying merkle-tree.ts can re-run it rather
 * than trusting the algorithm from memory or a code review alone.
 */
import {
  leafHash,
  merkleRoot,
  inclusionProof,
  reconstructRootFromInclusionProof,
  consistencyProof,
  verifyConsistencyProof,
} from '../src/common/merkle-tree';

let checks = 0;
let failures = 0;

function assert(cond: boolean, msg: string) {
  checks++;
  if (!cond) {
    failures++;
    console.log('FAIL:', msg);
  }
}

function randomLeaves(n: number): Buffer[] {
  const leaves: Buffer[] = [];
  for (let i = 0; i < n; i++) {
    leaves.push(leafHash(Buffer.from(`leaf-${i}-${Math.random()}`)));
  }
  return leaves;
}

// Inclusion: every leaf, every tree size 1..80
for (let n = 1; n <= 80; n++) {
  const leaves = randomLeaves(n);
  const root = merkleRoot(leaves);
  for (let m = 0; m < n; m++) {
    const proof = inclusionProof(m, leaves);
    const recomputed = reconstructRootFromInclusionProof(leaves[m], m, n, proof);
    assert(recomputed.equals(root), `inclusion n=${n} m=${m}`);
  }
}
console.log(`Inclusion proofs: ${checks} checks, ${failures} failures so far`);

// Tampered leaf must NOT verify
{
  const n = 37,
    m = 12;
  const leaves = randomLeaves(n);
  const root = merkleRoot(leaves);
  const proof = inclusionProof(m, leaves);
  const tampered = leafHash(Buffer.from('tampered-content'));
  const recomputed = reconstructRootFromInclusionProof(tampered, m, n, proof);
  assert(!recomputed.equals(root), 'tampered leaf must NOT verify');
}

// Consistency: every (m, n) pair, tree sizes 1..50
let consistencyChecks = 0;
for (let n = 1; n <= 50; n++) {
  const leaves = randomLeaves(n);
  const newRoot = merkleRoot(leaves);
  for (let m = 1; m <= n; m++) {
    const oldLeaves = leaves.slice(0, m);
    const oldRoot = merkleRoot(oldLeaves);
    const proof = consistencyProof(m, leaves);
    consistencyChecks++;
    const ok = verifyConsistencyProof(m, n, proof, oldRoot, newRoot);
    assert(ok, `consistency m=${m} n=${n}`);
  }
}
console.log(`Consistency proofs: ${consistencyChecks} pairs checked`);

// Forged old root (as if a leaf were silently altered) must NOT verify
{
  const n = 30,
    m = 10;
  const leaves = randomLeaves(n);
  const newRoot = merkleRoot(leaves);
  const proof = consistencyProof(m, leaves);
  const forged = leaves.slice(0, m);
  forged[5] = leafHash(Buffer.from('forged-content'));
  const forgedOldRoot = merkleRoot(forged);
  const ok = verifyConsistencyProof(m, n, proof, forgedOldRoot, newRoot);
  assert(!ok, 'forged old root must NOT verify as consistent');
}

// Wrong claimed newRoot (valid proof, wrong final root) must NOT verify
{
  const n = 20,
    m = 8;
  const leaves = randomLeaves(n);
  const oldRoot = merkleRoot(leaves.slice(0, m));
  const proof = consistencyProof(m, leaves);
  const wrongNewRoot = leafHash(Buffer.from('not-the-real-root'));
  const ok = verifyConsistencyProof(m, n, proof, oldRoot, wrongNewRoot);
  assert(!ok, 'wrong claimed newRoot must NOT verify');
}

// m === n and m === 0 edge cases
{
  const n = 15;
  const leaves = randomLeaves(n);
  const root = merkleRoot(leaves);
  const proof = consistencyProof(n, leaves);
  assert(proof.length === 0, 'proof for m===n should be empty');
  assert(verifyConsistencyProof(n, n, proof, root, root), 'm===n should trivially verify');
  assert(verifyConsistencyProof(0, n, [], Buffer.alloc(32), root), 'm===0 should trivially verify');
}

// Power-of-two boundary sizes (historically the most bug-prone)
for (const n of [1, 2, 3, 4, 7, 8, 9, 15, 16, 17, 31, 32, 33, 63, 64, 65]) {
  const leaves = randomLeaves(n);
  const root = merkleRoot(leaves);
  for (const m of [1, Math.floor(n / 2), n]) {
    if (m < 1 || m > n) continue;
    const oldRoot = merkleRoot(leaves.slice(0, m));
    const proof = consistencyProof(m, leaves);
    assert(verifyConsistencyProof(m, n, proof, oldRoot, root), `boundary consistency n=${n} m=${m}`);
  }
}

// At-scale sanity + concrete proof-size demonstration
{
  const n = 500;
  const leaves = randomLeaves(n);
  const root = merkleRoot(leaves);
  const m = 137;
  const proof = inclusionProof(m, leaves);
  assert(
    reconstructRootFromInclusionProof(leaves[m], m, n, proof).equals(root),
    'large-scale inclusion n=500 m=137',
  );
  console.log(`Inclusion proof size at n=500: ${proof.length} hashes (vs. scanning all 500 rows)`);

  const oldM = 200;
  const oldRoot = merkleRoot(leaves.slice(0, oldM));
  const cproof = consistencyProof(oldM, leaves);
  assert(
    verifyConsistencyProof(oldM, n, cproof, oldRoot, root),
    'large-scale consistency n=500 m=200',
  );
  console.log(`Consistency proof size at m=200,n=500: ${cproof.length} hashes`);
}

console.log(`\nTOTAL: ${checks} checks, ${failures} failures`);
if (failures > 0) process.exit(1);
