import Link from "next/link";
import { notFound } from "next/navigation";
import { cancelBooking, completeBooking, sendChatMessage } from "@/app/actions";
import ReSignIn from "@/app/_components/ReSignIn";
import ConfirmForm from "@/components/ConfirmForm";
import Forbidden from "@/components/Forbidden";
import LoadFailed from "@/components/LoadFailed";
import Notice from "@/components/Notice";
import { requireMe } from "@/components/session";
import { PageHeader, StatusBadge, cardClass, inputClass, primaryButtonClass, secondaryButtonClass } from "@/csmju";
import { call, getBooking, isUnauthorized, listChatMessages } from "@/lib/api";
import { canClose, counterpartOf } from "@/lib/booking";
import { formatDateTime, formatSlot, STATUS_LABEL, STATUS_TONE } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "รายละเอียดนัดหมาย" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const { id } = await params;
  const { ok, error } = await searchParams;
  // The backend answers 400 to anything but a UUID v4; for the user that is just "not found".
  if (!UUID.test(id)) notFound();
  const here = `/bookings/${id}`;

  const gate = await requireMe(here);
  if (!gate.me) return gate.view;
  const me = gate.me;

  const [booking, messages] = await Promise.all([getBooking(id), listChatMessages(id)]);
  if (isUnauthorized(booking, messages)) return <ReSignIn next={here} />;
  if (!booking.ok) {
    if (booking.status === 404) notFound();
    if (booking.status === 403) return <Forbidden />;
    return <LoadFailed message={booking.message} />;
  }

  // Chat is only between the booking's two people - not even the admin reads it (403 for them).
  const chat = messages.ok ? messages.data : null;
  const unread = chat?.filter((message) => !message.isRead && message.senderCoreUserId !== me.id) ?? [];
  await Promise.all(unread.map((message) => call(`/api/v1/chat-messages/${message.id}/read`, { method: "PATCH" })));
  const readIds = new Set(unread.map((message) => message.id));

  const data = booking.data;
  const range = formatSlot(data.startsAt, data.endsAt);
  const isParty = me.id === data.teacherCoreUserId || me.id === data.studentCoreUserId;

  return (
    <>
      <PageHeader title="รายละเอียดนัดหมาย" description={range} />

      <Notice ok={ok} error={error} />

      <section className={`fade-slide-up stagger-1 ${cardClass} space-y-4 px-6 py-5`}>
        <dl className="grid grid-cols-1 gap-4 text-body-md md:grid-cols-2">
          <div>
            <dt className="text-label-md text-on-surface-variant">วันและเวลา</dt>
            <dd className="mt-1 font-medium text-on-surface">{range}</dd>
          </div>
          <div>
            <dt className="text-label-md text-on-surface-variant">{me.subsystemRole === "STUDENT" ? "อาจารย์" : "นักศึกษา"}</dt>
            <dd className="mt-1 font-medium text-on-surface">{counterpartOf(me, data)}</dd>
          </div>
          <div>
            <dt className="text-label-md text-on-surface-variant">หัวข้อ</dt>
            <dd className="mt-1 text-on-surface">{data.topic}</dd>
          </div>
          <div>
            <dt className="text-label-md text-on-surface-variant">สถานะ</dt>
            <dd className="mt-1">
              <StatusBadge tone={STATUS_TONE[data.status]} label={STATUS_LABEL[data.status]} />
            </dd>
          </div>
        </dl>

        <div className="flex flex-wrap justify-end gap-3 border-t border-outline-variant/40 pt-4">
          <Link href="/bookings" className={secondaryButtonClass}>
            กลับไปรายการนัดหมาย
          </Link>
          {canClose(me, data) && (
            <>
              <ConfirmForm
                action={completeBooking}
                fields={{ id: data.id, returnTo: here }}
                trigger="ทำเครื่องหมายเสร็จสิ้น"
                triggerLabel={`ทำเครื่องหมายเสร็จสิ้น ${range}`}
                title="ทำเครื่องหมายว่าเสร็จสิ้น?"
                message={`นัดหมาย ${range} หัวข้อ "${data.topic}" จะถูกปิดเป็นเสร็จสิ้น`}
                confirmLabel="ทำเครื่องหมายเสร็จสิ้น"
                tone="primary"
              />
              <ConfirmForm
                action={cancelBooking}
                fields={{ id: data.id, returnTo: here }}
                trigger="ยกเลิกนัดหมาย"
                triggerLabel={`ยกเลิกนัดหมาย ${range}`}
                title="ยกเลิกนัดหมายนี้?"
                message={`นัดหมาย ${range} หัวข้อ "${data.topic}" จะถูกยกเลิก และช่วงเวลานี้จะกลับมาว่างให้นัดหมายใหม่`}
                confirmLabel="ยกเลิกนัดหมาย"
              />
            </>
          )}
        </div>
      </section>

      <section className={`fade-slide-up stagger-2 ${cardClass}`} aria-labelledby="chat-title">
        <h2
          id="chat-title"
          className="border-b border-outline-variant/40 px-6 py-5 font-display text-headline-md text-on-surface"
        >
          ข้อความ
        </h2>

        {!isParty || chat === null ? (
          <p className="px-6 py-8 text-body-md text-on-surface-variant">
            ข้อความของนัดหมายนี้ดูได้เฉพาะอาจารย์และนักศึกษาที่เป็นคู่นัดหมาย
          </p>
        ) : (
          <>
            <ul className="space-y-3 px-6 py-5" aria-live="polite">
              {chat.length === 0 && (
                <li className="py-4 text-center text-body-md text-on-surface-variant">
                  ยังไม่มีข้อความ เริ่มสนทนาได้ที่ช่องด้านล่าง
                </li>
              )}
              {chat.map((message) => {
                const mine = message.senderCoreUserId === me.id;
                return (
                  <li key={message.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[80%] rounded-xl px-4 py-2.5 text-body-md ${
                        mine ? "bg-primary-container text-white" : "bg-surface-variant text-on-surface"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{message.message}</p>
                      <p className={`mt-1 text-label-sm ${mine ? "text-white/70" : "text-on-surface-variant"}`}>
                        {formatDateTime(message.createdAt)}
                        {!mine && readIds.has(message.id) ? " · เพิ่งอ่าน" : ""}
                        {mine && message.isRead ? " · อ่านแล้ว" : ""}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>

            <form action={sendChatMessage} className="space-y-3 border-t border-outline-variant/40 px-6 py-5">
              <input type="hidden" name="bookingId" value={data.id} />
              <div>
                <label htmlFor="message" className="mb-2 block text-label-md text-on-surface">
                  ข้อความ *
                </label>
                <textarea
                  id="message"
                  name="message"
                  required
                  aria-required="true"
                  rows={3}
                  maxLength={1000}
                  className={inputClass}
                />
              </div>
              <div className="flex justify-end">
                <button type="submit" className={primaryButtonClass}>
                  ส่งข้อความ
                </button>
              </div>
            </form>
          </>
        )}
      </section>
    </>
  );
}
