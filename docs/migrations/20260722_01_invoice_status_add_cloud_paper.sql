-- 2026-07-22 修正：member_tickets.invoice_status enum 缺 cloud/paper
--
-- 背景：2026-07-21 A3「營收分有無發票」讓售票表單把發票欄（none/cloud/paper）直接寫進
-- member_tickets.invoice_status，但該欄是 0000_baseline 的 enum('none','issued') ——
-- 選「雲端發票/紙本發票」的售票寫入會整筆失敗（enum violation），只有「免發票」能成立。
-- 260722.0953 前端已加防護（enum 未套時自動退回 'issued' 重寫，售票不丟單），
-- 本檔補齊 enum 值讓 cloud/paper 正常記載。
--
-- 語意：none=免發票、issued=已開立（購買申請流程既有值）、cloud=雲端發票、paper=紙本發票。
-- KPI「有發票」＝cloud/paper/issued。
--
-- 回退：Postgres enum 值無法移除；不使用即無影響。

alter type invoice_status add value if not exists 'cloud';
alter type invoice_status add value if not exists 'paper';
