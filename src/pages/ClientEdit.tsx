import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '../services/api';
import { GlassCard, Button, Input, Label, Select, TextArea } from '../components/ui/UIComponents';
import { ImageUpload } from '../components/ui/ImageUpload';
import { Client, ClientStatus } from '../types';
import { navigateBack } from '@/utils/navigation';

export const ClientEdit: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { clientId } = useParams();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const handleGoBack = () => navigateBack(navigate, clientId ? `/app/clients/${clientId}` : '/app/clients');

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | undefined>(undefined);

  // Flattened state for form
  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    status: 'active' as ClientStatus,
    contactPerson: '',
    email: '',
    phone: '',
    website: '',
    address: '',
    currency: 'SAR',
    vatNumber: '',
    notes: ''
  });

  useEffect(() => {
    if (clientId) {
      api.clients.get(clientId).then(async (data) => {
        if (data) {
          setFormData({
            name: data.name,
            industry: data.industry || '',
            status: data.status,
            contactPerson: data.contactPerson || '',
            email: data.email || '',
            phone: data.phone || '',
            website: data.website || '',
            address: data.address || '',
            notes: data.notes || '',
            currency: data.billing?.currency || 'SAR',
            vatNumber: data.billing?.vatNumber || ''
          });

          if (data.logo) {
            try {
              const url = await api.clients.downloadFile(data.id, data.logo);
              setLogoPreview(url);
            } catch (e) {
              console.error("Failed to load logo", e);
            }
          }
        }
        setFetching(false);
      });
    }
  }, [clientId]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
  if (!clientId) return;
    setLoading(true);
    try {
      let logoId = undefined; // Undefined means no change to existing logo field

      if (logoFile) {
        // user selected a new file
        try {
          const fileAsset = await api.clients.uploadFile(clientId, logoFile, 'LOGO', 'CLIENT');
          if (fileAsset) {
            logoId = fileAsset.id;
          }
        } catch (uploadError) {
          console.error("Failed to upload logo:", uploadError);
        }
      }

      const payload: Partial<Client> = {
        name: formData.name,
        industry: formData.industry,
        status: formData.status,
        contactPerson: formData.contactPerson,
        email: formData.email,
        phone: formData.phone,
        website: formData.website,
        address: formData.address,
        notes: formData.notes,
        billing: {
          currency: formData.currency,
          vatNumber: formData.vatNumber
        },
        ...(logoId && { logo: logoId })
      };

      await api.clients.update(clientId, payload);
      navigate(`/app/clients/${clientId}`);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <div className="p-10 text-center text-slate-500">{t('retrieving_configuration')}</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={handleGoBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold font-display text-white">{t('edit_client')}</h1>
          <p className="text-slate-400">{t('update_entity_configuration')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <GlassCard title={t('company_info')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <ImageUpload
                label={t('company_logo')}
                initialPreview={logoPreview}
                onFileSelect={setLogoFile}
              />
            </div>
            <div>
              <Label htmlFor="name">{t('client_name')}</Label>
              <Input name="name" id="name" required value={formData.name} onChange={handleChange} />
            </div>
            <div>
              <Label htmlFor="industry">{t('industry')}</Label>
              <Input name="industry" id="industry" required value={formData.industry} onChange={handleChange} />
            </div>
            <div>
              <Label htmlFor="status">{t('status')}</Label>
              <Select name="status" id="status" value={formData.status} onChange={handleChange}>
                <option value="active">{t('active')}</option>
                <option value="inactive">{t('inactive')}</option>
                <option value="archived">{t('archived')}</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="website">{t('website')}</Label>
              <Input name="website" id="website" type="text" value={formData.website} onChange={handleChange} />
            </div>
          </div>
        </GlassCard>

        <GlassCard title={t('primary_contact')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="contactPerson">{t('contact')}</Label>
              <Input name="contactPerson" id="contactPerson" required value={formData.contactPerson} onChange={handleChange} />
            </div>
            <div>
              <Label htmlFor="email">{t('email_address')}</Label>
              <Input name="email" id="email" type="email" required value={formData.email} onChange={handleChange} />
            </div>
            <div>
              <Label htmlFor="phone">{t('phone')}</Label>
              <Input name="phone" id="phone" value={formData.phone} onChange={handleChange} />
            </div>
            <div>
              <Label htmlFor="address">{t('address')}</Label>
              <Input name="address" id="address" value={formData.address} onChange={handleChange} />
            </div>
          </div>
        </GlassCard>

        <GlassCard title={t('billing_profile')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <Label htmlFor="currency">{t('currency')}</Label>
              <Select name="currency" id="currency" value={formData.currency} onChange={handleChange}>
                <option value="SAR">SAR (ر.س)</option>
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="AED">AED (د.إ)</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="vatNumber">{t('vat_number')}</Label>
              <Input name="vatNumber" id="vatNumber" value={formData.vatNumber} onChange={handleChange} />
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="notes">{t('notes')}</Label>
              <TextArea name="notes" id="notes" rows={3} value={formData.notes} onChange={handleChange} />
            </div>
          </div>
        </GlassCard>

        <div className="flex justify-end gap-4">
          <Button type="button" variant="ghost" onClick={handleGoBack}>{t('cancel')}</Button>
          <Button type="submit" disabled={loading} className="w-40">
            <Save className="w-4 h-4 mr-2" />
            {loading ? t('updating_dots') : t('update_client')}
          </Button>
        </div>
      </form>
    </div>
  );
};
