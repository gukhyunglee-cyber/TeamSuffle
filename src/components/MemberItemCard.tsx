/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Trash2, Edit2 } from 'lucide-react';
import { Member } from '../types';
import { motion } from 'motion/react';

interface MemberItemCardProps {
  key?: string | number;
  member: Member;
  onDelete: (id: string) => void;
  onToggleSelect: (id: string) => void;
  onEdit: (member: Member) => void;
}

export default function MemberItemCard({ member, onDelete, onToggleSelect, onEdit }: MemberItemCardProps) {
  // Safe default for selected is true
  const isSelected = member.selected !== false;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 5, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, transition: { duration: 0.1 } }}
      className={`flex flex-col items-center p-3 sm:p-4 border rounded-xl sm:rounded-2xl transition-all relative group select-none min-h-[145px] sm:min-h-[190px] h-full justify-between cursor-pointer ${
        isSelected
          ? 'bg-white border-slate-205 hover:border-indigo-300 shadow-sm hover:shadow-md'
          : 'bg-slate-50/70 border-slate-200/60 opacity-60'
      }`}
      onClick={() => onToggleSelect(member.id)}
    >
      {/* Top Row: Checkbox & Hover Actions */}
      <div className="w-full flex items-center justify-between shrink-0 mb-1 z-10">
        <input
          type="checkbox"
          checked={isSelected}
          onChange={() => {}} // Controlled by onClick on parent/itself
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect(member.id);
          }}
          className="w-4 h-4 sm:w-4.5 sm:h-4.5 text-indigo-600 border-slate-350 rounded cursor-pointer accent-indigo-600 transition-transform duration-150 active:scale-90"
          title={isSelected ? "조 추첨에서 제외" : "조 추첨에 포함"}
        />

        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity duration-200">
          {/* Action edit btn */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(member);
            }}
            className="text-slate-400 hover:text-indigo-600 hover:bg-slate-100 p-1 sm:p-1.5 rounded-lg border border-transparent hover:border-slate-150 bg-white shadow-3xs transition-all cursor-pointer"
            aria-label="수정"
            title="부서원 정보 수정"
          >
            <Edit2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500 hover:text-indigo-600" />
          </button>

          {/* Action delete btn */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(member.id);
            }}
            className="text-slate-400 hover:text-red-650 hover:bg-rose-50 p-1 sm:p-1.5 rounded-lg border border-transparent hover:border-rose-150 bg-white shadow-3xs transition-all cursor-pointer"
            aria-label="삭제"
            title="부서원 삭제"
          >
            <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-500 hover:text-rose-600" />
          </button>
        </div>
      </div>

      {/* Photo & Name Wrapper */}
      <div className="flex flex-col items-center flex-1 justify-center w-full my-1 sm:my-2">
        {/* Square profile photo with responsive viewport dimensions */}
        <div 
          className={`w-12 h-12 sm:w-16 sm:h-16 rounded-lg sm:rounded-xl overflow-hidden border border-slate-150 shrink-0 select-none transition-all duration-300 flex items-center justify-center ${
            isSelected 
              ? 'group-hover:scale-105 group-hover:border-indigo-200 shadow-xs' 
              : 'grayscale contrast-75'
          }`}
        >
          {member.photoUrl ? (
            <img
              src={member.photoUrl}
              alt={member.name}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center font-black text-xs sm:text-xl">
              {member.name ? member.name.charAt(0) : '?'}
            </div>
          )}
        </div>

        {/* Member meta (Name and Role below photo) */}
        <div className="min-w-0 w-full text-center mt-2 px-0.5">
          <h4 className={`text-xs sm:text-sm md:text-base font-black truncate tracking-tight leading-normal ${
            isSelected ? 'text-slate-800' : 'text-slate-400 line-through decoration-slate-300'
          }`}>
            {member.name}
          </h4>
          {member.role && (
            <p className="text-[9px] sm:text-[11px] text-slate-400 font-bold truncate tracking-wide mt-0.5 leading-tight">
              {member.role.split('/')[0]}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
