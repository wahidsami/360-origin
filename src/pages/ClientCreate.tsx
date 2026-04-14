import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save } from 'lucide-react';
import { api } from '../services/api';
import { GlassCard, Button, Input, Label, Select, TextArea } from '../components/ui/UIComponents';
import { ImageUpload } from '../components/ui/ImageUpload';
import { ClientStatus } from '../types';
import { navigateBack } from '@/utils/navigation';

export const ClientCreate: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const handleGoBack = () => navigateBack(navigate, '/app/clients');

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const payload: any = {
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
        }
      };

      const newClient = await api.clients.create(payload);

      if (logoFile && newClient) {
        // Upload logo
        try {
          const fileAsset = await api.clients.uploadFile(newClient.id, logoFile, 'LOGO', 'CLIENT');
          if (fileAsset) {
            // Update client with logo ID/URL
            await api.clients.update(newClient.id, { logo: fileAsset.id });
          }
        } catch (uploadError) {
          console.error("Failed to upload logo:", uploadError);
          // Creating client succeeded, so we proceed but maybe warn user?
          // For now, silently log.
        }
      }

      navigate(`/app/clients/${newClient.id}`);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" onClick={handleGoBack}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold font-display text-white">{t('add_new_client')}</h1>
          <p className="text-slate-400">{t('create_new_client')}</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <GlassCard title={t('company_info')}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <ImageUpload
                label={t('company_logo')}
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
            {loading ? t('saving_dots') : t('save_client')}
          </Button>
        </div>
      </form>
    </div>
  );
};
