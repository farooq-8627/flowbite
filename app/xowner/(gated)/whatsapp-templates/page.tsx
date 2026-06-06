import { WhatsappTemplatesView } from "@/owner/views/whatsapp-templates/WhatsappTemplatesView";

/**
 * `/xowner/whatsapp-templates` — B.40 owner CRUD for the cross-org
 * WhatsApp template set. The view itself enforces owner auth via the
 * underlying queries; the layout's OTP gate is the first line.
 */
export default function OwnerWhatsappTemplatesPage() {
	return <WhatsappTemplatesView />;
}
