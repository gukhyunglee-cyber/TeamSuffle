/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Member {
  id: string;
  departmentId?: string; // Associated department ID
  name: string;
  photoUrl: string;
  role?: string;
  selected?: boolean; // True if included in the shuffle group, false if excluded
  createdAt?: string;
  updatedAt?: string;
}

export interface Department {
  id: string;
  name: string;
  password?: string; // Salt/Simple password or plaintext stored securely in DB
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  id: string;
  name: string;
  members: Member[];
}
