/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Trash2 } from 'lucide-react';
import { Member } from '../types';
import { motion } from 'motion/react';

interface MemberItemCardProps {
  key?: string | number;
  member: Member;
  onDelete: (id: string) => void;
  onToggleSelect: (id: string) => void;
}

export default function MemberItemCard({ member, onDelete, onToggleSelect }: MemberItemCardProps) {
  // Safe default for selected is true
  const isSelected = member.selected !== false;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 5, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
      className={`flex items-center gap-2 p-2 border rounded-lg transition-all relative group ${
        isSelected
          ? 'bg-white border-slate-200 hover:border-indigo-200 shadow-sm'
          : 'bg-slate-50/70 border-slate-200/60 opacity-60'
      }`}
    >
      {/* Selection Checkbox */}
      <input
        type="checkbox"
        checked={isSelected}
        onChange={() => onToggleSelect(member.id)}
        className="w-3.5 h-3.5 text-indigo-600 border-slate-300 rounded cursor-pointer accent-indigo-600 shrink-0"
        title={isSelected ? "조 추첨에서 제외" : "조 추첨에 포함"}
      />

      {/* Square compact profile of the Sleek Interface with active/grayscale conditional */}
      <div 
        onClick={() => onToggleSelect(member.id)}
        className={`w-8 h-8 rounded-md overflow-hidden border border-slate-100 shrink-0 cursor-pointer select-none transition-all ${
          isSelected ? '' : 'grayscale contrast-75'
        }`}
      >
        <img
          src={member.photoUrl}
          alt={member.name}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
        />
      </div>

      {/* Member meta */}
      <div 
        onClick={() => onToggleSelect(member.id)}
        className="min-w-0 flex-1 cursor-pointer select-none"
      >
        <h4 className={`text-[11px] font-bold truncate leading-tight ${
          isSelected ? 'text-slate-800' : 'text-slate-500 line-through decoration-slate-300'
        }`}>{member.name}</h4>
        {member.role && (
          <p className="text-[9px] text-slate-400 font-medium truncate leading-none mt-0.5">{member.role.split('/')[0]}</p>
        )}
      </div>

      {/* Action delete btn */}
      <button
        onClick={() => onDelete(member.id)}
        className="text-slate-400 hover:text-red-500 hover:bg-slate-50 p-1 rounded-md transition-all cursor-pointer opacity-0 group-hover:opacity-100 focus:opacity-100 shrink-0"
        aria-label="삭제"
      >
        <Trash2 className="w-3 h-3" />
      </button>
    </motion.div>
  );
}
